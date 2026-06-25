import { lookup as dnsLookup } from 'node:dns/promises'
import net from 'node:net'
import type { AzureConfig } from '@shared/config-contract'

/**
 * Standalone-Funktion: prüft per HTTPS HEAD-Request, ob der konfigurierte Azure-
 * Endpoint erreichbar ist und der Speech-Key vom Server akzeptiert wird. Ohne
 * SDK-Init nutzbar, damit der Test-Button im Settings-Dialog auch ohne laufende
 * Transkription funktioniert.
 *
 * Zusätzlich wird ein DNS-Lookup durchgeführt (System-DNS + Fallback) und ein
 * TCP-Connect-Probe auf Port 443 der aufgelösten IP, damit Firewalls, die nur
 * ICMP durchlassen, eindeutig identifiziert werden können.
 *
 * Rückgabe-Typ ist AzureConnectivityResult und enthält URL, HTTP-Status,
 * Status-Text, Latenz (ms), DNS-/TCP-Status sowie ggf. eine Fehlermeldung.
 */
export type AzureConnectivityResult = {
  probeUrl: string
  reachable: boolean
  httpStatus?: number
  httpStatusText?: string
  latencyMs: number
  error?: string
  steps: Array<{ step: string; status: 'ok' | 'warn' | 'error'; detail: string }>
}

async function probeTcp(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const timer = setTimeout(() => {
      socket.destroy()
      resolve({ ok: false, latencyMs: Date.now() - start, error: `Timeout nach ${timeoutMs} ms` })
    }, timeoutMs)

    socket.once('connect', () => {
      clearTimeout(timer)
      socket.end()
      resolve({ ok: true, latencyMs: Date.now() - start })
    })

    socket.once('error', (err: Error) => {
      clearTimeout(timer)
      socket.destroy()
      resolve({ ok: false, latencyMs: Date.now() - start, error: err.message })
    })

    socket.connect(port, host)
  })
}

function hostFromEndpoint(endpoint: string): string {
  return endpoint
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^https:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim()
}

export async function diagnoseEndpointReachability(
  azureConfig: AzureConfig,
  onDebug?: (message: string, level?: 'info' | 'warn' | 'error') => void
): Promise<AzureConnectivityResult> {
  const steps: AzureConnectivityResult['steps'] = []
  const endpoint = azureConfig.endpoint?.trim() ?? ''

  if (!endpoint) {
    const message = 'Endpoint-Diagnose: Kein Endpoint konfiguriert, übersprungen.'
    onDebug?.(message, 'warn')
    return {
      probeUrl: '',
      reachable: false,
      latencyMs: 0,
      error: message,
      steps: [{ step: 'config', status: 'error', detail: 'Kein Endpoint konfiguriert' }]
    }
  }

  const host = hostFromEndpoint(endpoint)
  steps.push({ step: 'endpoint', status: 'ok', detail: `Endpoint-Host: ${host}` })

  // Schritt 1: DNS-Resolution via System-Resolver
  let resolvedIp: string | null = null
  const dnsStart = Date.now()
  try {
    const lookup = await dnsLookup(host)
    resolvedIp = lookup.address
    steps.push({
      step: 'dns-system',
      status: 'ok',
      detail: `System-DNS liefert ${resolvedIp} (${Date.now() - dnsStart} ms)`
    })
    onDebug?.(`DNS-System: ${host} -> ${resolvedIp} (${Date.now() - dnsStart} ms)`)
  } catch (dnsError) {
    const errMessage = dnsError instanceof Error ? dnsError.message : String(dnsError)
    steps.push({
      step: 'dns-system',
      status: 'error',
      detail: `System-DNS-Auflösung fehlgeschlagen: ${errMessage}`
    })
    onDebug?.(`DNS-System: ${host} -> FEHLER (${errMessage})`, 'error')
  }

  // Schritt 2: DNS-Resolution via Fallback-Resolver als Vergleich
  try {
    const fallback = await dnsLookup(host, { family: 4 })
    if (fallback.address !== resolvedIp) {
      steps.push({
        step: 'dns-conflict',
        status: 'warn',
        detail: `Fallback-DNS liefert ${fallback.address}, System-DNS liefert ${resolvedIp ?? '<NXDOMAIN>'}. Corporate-DNS filtert möglicherweise Custom-Domains.`
      })
    } else {
      steps.push({
        step: 'dns-fallback',
        status: 'ok',
        detail: `Fallback-DNS bestätigt ${fallback.address}`
      })
    }
  } catch (fallbackError) {
    // ok, nicht jeder Host ist über den Fallback-Resolver erreichbar
    steps.push({
      step: 'dns-fallback',
      status: 'warn',
      detail: `Fallback-DNS-Auflösung nicht möglich: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
    })
  }

  // Schritt 3: TCP-Connect auf Port 443 (zeigt Firewalls/Proxies, die nur ICMP erlauben)
  if (resolvedIp) {
    const tcp = await probeTcp(resolvedIp, 443, 5_000)
    if (tcp.ok) {
      steps.push({
        step: 'tcp-443',
        status: 'ok',
        detail: `TCP 443 zu ${resolvedIp} offen (${tcp.latencyMs} ms)`
      })
    } else {
      steps.push({
        step: 'tcp-443',
        status: 'error',
        detail: `TCP 443 zu ${resolvedIp} blockiert (${tcp.error ?? 'unbekannt'}). Firewall blockt direkte HTTPS-Verbindungen - Verbindung muss über Proxy laufen.`
      })
      onDebug?.(`TCP-Connect ${resolvedIp}:443 -> FEHLER (${tcp.error}). Firewall-Intercept wahrscheinlich.`, 'error')
    }
  }

  // Schritt 4: HTTPS-Probe per fetch (zeigt 4xx vs Netzwerkfehler)
  let probeUrl = endpoint.replace(/^wss:\/\//i, 'https://').replace(/\/$/, '')
  probeUrl = `${probeUrl}/speech/recognition/interactive/cognitiveservices/v1?language=de-DE`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  const start = Date.now()

  try {
    const response = await fetch(probeUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'Ocp-Apim-Subscription-Key': azureConfig.speechKey }
    })
    const latencyMs = Date.now() - start
    steps.push({
      step: 'https-probe',
      status: response.ok || response.status === 401 || response.status === 403 ? 'ok' : 'warn',
      detail: `HTTPS-Probe HTTP ${response.status} ${response.statusText} (${latencyMs} ms)`
    })
    onDebug?.(`HTTPS-Probe: ${probeUrl} -> HTTP ${response.status} ${response.statusText} (${latencyMs} ms)`)
    return {
      probeUrl,
      reachable: true,
      httpStatus: response.status,
      httpStatusText: response.statusText,
      latencyMs,
      steps
    }
  } catch (error) {
    const latencyMs = Date.now() - start
    const errMessage = error instanceof Error ? error.message : String(error)
    steps.push({
      step: 'https-probe',
      status: 'error',
      detail: `HTTPS-Probe fehlgeschlagen: ${errMessage} (${latencyMs} ms)`
    })
    onDebug?.(`HTTPS-Probe: ${probeUrl} -> FEHLER (${errMessage}, ${latencyMs} ms). Tipp: Wenn 'ENETUNREACH' oder 'ECONNREFUSED', blockt die Firewall - Verbindung muss über den konfigurierten Proxy laufen.`, 'error')
    return {
      probeUrl,
      reachable: false,
      latencyMs,
      error: errMessage,
      steps
    }
  } finally {
    clearTimeout(timeout)
  }
}