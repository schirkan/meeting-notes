# Azure Speech SDK (JavaScript/NPM) — PoC-relevante Methoden

Stand: 02.06.2026  
Paket: `microsoft-cognitiveservices-speech-sdk` (NPM)

## 1) Executive Summary für deinen PoC

Für den geplanten Windows-11 Electron/React PoC ist das SDK fachlich passend, aber mit einem wichtigen Architekturpunkt:

- **Transkription/Streaming/Diarization**: gut durch SDK abgedeckt
- **AudioConfig bietet Default-Methoden**, aber mit unterschiedlicher Semantik: `fromDefaultMicrophoneInput()` = Input, `fromDefaultSpeakerOutput()` = Output/Playback.
- **`fromDefaultSpeakerOutput()` ist kein STT-Loopback-Capture**. Im SDK-Code erzeugt die Methode ein `AudioOutputConfigImpl(new SpeakerAudioDestination())` und `SpeakerAudioDestination` ist als Browser-Playback-Ziel dokumentiert.
- **Audio-Capture in Node.js**: laut Microsoft-Quickstart ist **Mikrofon-Capture in Node.js nicht direkt unterstützt** (Browser/React-Szenario ja)
- Konsequenz für deinen PoC: Audio (Mic + Speaker-Loopback) muss über
  - Browser-/Renderer-Capture und Push-Stream **oder**
  - externe Capture-Bibliotheken (Node/native) erfolgen
  und dann in `AudioInputStream.createPushStream()` eingespeist werden.

Damit liegt die Hauptkomplexität **nicht** bei Azure Speech selbst, sondern bei robustem Audio-Ingest (insb. Speaker-Loopback).

---

## 2) Für den PoC wichtigste Klassen/Methoden

## A. Auth & Basiskonfiguration

### `SpeechConfig`
Relevante Factory-Methoden:
- `SpeechConfig.fromSubscription(key, region)`
- `SpeechConfig.fromEndpoint(new URL(endpoint), key)`
- `SpeechConfig.fromAuthorizationToken(token, region)`

Wichtige Properties/Methoden:
- `speechConfig.speechRecognitionLanguage = "de-DE"`
- `speechConfig.outputFormat = OutputFormat.Detailed`
- `speechConfig.requestWordLevelTimestamps()`
- `speechConfig.setProperty(nameOrPropertyId, value)`

PoC-Relevanz: **hoch**

---

## B. Audio-Input in die SDK-Pipeline

### `AudioConfig`
Eingangspfade:
- `AudioConfig.fromWavFileInput(...)`
- `AudioConfig.fromStreamInput(audioInputStream)`
- `AudioConfig.fromDefaultMicrophoneInput()`
- `AudioConfig.fromMicrophoneInput(deviceId?)` *(API vorhanden, aber Node-Mic laut Docs limitiert)*

Wichtige Abgrenzung:
- `AudioConfig.fromDefaultSpeakerOutput()` und `AudioConfig.fromSpeakerOutput(...)` sind **Audio-Ausgabe** (z. B. TTS-Playback), **kein** Loopback-Capture für STT.
- Für Speaker-Transkription ist weiterhin ein separater Capture-Pfad nötig, der Audio als Stream in `fromStreamInput(...)` einspeist.

Kontext-Check (Browser vs Node):
- Browser: `fromStreamInput(MediaStream)` ist möglich und kann mit geeignetem externem Capture-`MediaStream` (z. B. tab/system audio via Browser API) genutzt werden.
- Node.js: kein nativer `MediaStream`-Pfad; praktikabel sind Push/Pull-Streams (`AudioInputStream`) aus externem Capture.

### `AudioInputStream`
- `AudioInputStream.createPushStream(format?)`
- `AudioStreamFormat.getWaveFormatPCM(sampleRate, bits, channels)`
- `pushStream.write(arrayBuffer)`
- `pushStream.close()`

PoC-Relevanz: **sehr hoch** (zentral für getrennte Mic/Speaker-Pipelines)

---

## C. Standard-STT (ohne Diarization)

### `SpeechRecognizer`
- Konstruktor: `new SpeechRecognizer(speechConfig, audioConfig)`
- `recognizer.startContinuousRecognitionAsync(...)`
- `recognizer.stopContinuousRecognitionAsync(...)`
- Events:
  - `recognizing` (interim)
  - `recognized` (final)
  - `canceled`
  - `sessionStarted`
  - `sessionStopped`

PoC-Relevanz: **hoch** (für reine Quelle-zu-Text-Pipeline)

---

## D. Mehrsprecher-Erkennung / Diarization

### `ConversationTranscriber`
- Konstruktor: `new ConversationTranscriber(speechConfig, audioConfig)`
- `startTranscribingAsync(...)`
- `stopTranscribingAsync(...)`
- Events:
  - `transcribing` (interim)
  - `transcribed` (final)
  - `canceled`
  - `sessionStarted` / `sessionStopped`

### Ergebnisobjekt
- `ConversationTranscriptionResult.speakerId`
- `result.text`
- `result.offset`, `result.duration`

### Relevante Property
- `PropertyId.SpeechServiceResponse_DiarizeIntermediateResults` = `"true"|"false"`
  - Aktiviert Sprecher-ID bereits in Interim-Ergebnissen (ConversationTranscriber-Szenario)

PoC-Relevanz: **hoch** (dein Nice-to-have Mehrsprecher)

---

## E. Fehler- und Verbindungssteuerung

### Fehlerdetails
- `CancellationDetails.fromResult(result)`
- `CancellationErrorCode` (z. B. `AuthenticationFailure`, `TooManyRequests`, `ServiceTimeout`)

### Verbindung (optional)
- `Connection.fromRecognizer(recognizer)`
- `connection.openConnection()` (Prewarm)
- `connection.connected` / `connection.disconnected`

PoC-Relevanz: **mittel** (hilfreich für Diagnose/Latenzstabilität)

---

## F. Qualitätstuning

### `PhraseListGrammar`
- `PhraseListGrammar.fromRecognizer(recognizer)`
- `addPhrase(...)`, `addPhrases(...)`, `setWeight(...)`

PoC-Relevanz: **mittel** (Domain-Begriffe verbessern Erkennung)

---

## 3) Komplexität für deinen konkreten Zweck

Bewertungsskala: niedrig / mittel / hoch

- Azure Auth + Basiskonfig: **niedrig**
- Kontinuierliche STT-Pipeline (1 Stream): **mittel**
- 2 parallele Pipelines (Mic + Speaker): **mittel-hoch**
- Diarization (ConversationTranscriber): **mittel**
- Diarization in Interim-Ergebnissen: **mittel**
- Robustes Windows Speaker-Loopback-Ingest: **hoch**
- Gesamtsystem für deinen PoC: **mittel-hoch**

### Warum mittel-hoch?
Nicht wegen Azure-SDK-APIs, sondern wegen Audio-Ingest und Synchronität:
- Gerätewechsel
- Loopback-Stabilität
- Paket-/Treiberverhalten
- Latenz < 5s bei zwei gleichzeitigen Streams

---

## 4) Codebeispiele (PoC-fokussiert)

## Beispiel 1: Basis-Konfiguration + kontinuierliche Erkennung

```js
const sdk = require("microsoft-cognitiveservices-speech-sdk");

function createSpeechConfig(cfg) {
  // cfg aus fester JSON-Datei (endpoint, key, defaultLanguage)
  const speechConfig = sdk.SpeechConfig.fromEndpoint(new URL(cfg.endpoint), cfg.key);
  speechConfig.speechRecognitionLanguage = cfg.language || "de-DE";
  speechConfig.outputFormat = sdk.OutputFormat.Detailed;
  speechConfig.requestWordLevelTimestamps();
  return speechConfig;
}

function startRecognizerFromPushStream(speechConfig, pushStream) {
  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  recognizer.recognizing = (_, e) => {
    // interim
    console.log("[interim]", e.result.text);
  };

  recognizer.recognized = (_, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
      console.log("[final]", e.result.text);
    }
  };

  recognizer.canceled = (_, e) => {
    console.error("Canceled:", e.errorDetails);
  };

  recognizer.startContinuousRecognitionAsync();
  return recognizer;
}
```

## Beispiel 2: ConversationTranscriber mit Speaker-ID (Diarization)

```js
const sdk = require("microsoft-cognitiveservices-speech-sdk");

function createConversationTranscriber(speechConfig, pushStream) {
  // Diarization in interim aktivieren (ConversationTranscriber)
  speechConfig.setProperty(
    sdk.PropertyId.SpeechServiceResponse_DiarizeIntermediateResults,
    "true"
  );

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const transcriber = new sdk.ConversationTranscriber(speechConfig, audioConfig);

  transcriber.transcribing = (_, e) => {
    console.log("[interim]", {
      speaker: e.result.speakerId || "Unknown",
      text: e.result.text
    });
  };

  transcriber.transcribed = (_, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
      console.log("[final]", {
        speaker: e.result.speakerId || "Unknown",
        text: e.result.text,
        offset100ns: e.result.offset,
        duration100ns: e.result.duration
      });
    }
  };

  transcriber.canceled = (_, e) => {
    console.error("Canceled:", e.errorDetails);
  };

  transcriber.startTranscribingAsync();
  return transcriber;
}
```

## Beispiel 3: Zwei getrennte Pipelines (Mic + Speaker) im PoC

```js
// Architekturidee: beide Push-Streams werden von deinem Capture-Layer befüllt
// (Renderer/WebAudio oder natives Capture-Paket).

const micStream = sdk.AudioInputStream.createPushStream(
  sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
);

const speakerStream = sdk.AudioInputStream.createPushStream(
  sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
);

const micCfg = createSpeechConfig({ endpoint, key, language });
const spkCfg = createSpeechConfig({ endpoint, key, language });

const micTx = createConversationTranscriber(micCfg, micStream);
const spkTx = createConversationTranscriber(spkCfg, speakerStream);

// Capture-Layer ruft laufend auf:
// micStream.write(micPcmArrayBuffer)
// speakerStream.write(speakerPcmArrayBuffer)

// Beim Stop:
// micTx.stopTranscribingAsync(); spkTx.stopTranscribingAsync();
// micStream.close(); speakerStream.close();
```

## Beispiel 4: Fehlerklassifizierung für UI-Feedback

```js
function formatCancellation(result, sdk) {
  const details = sdk.CancellationDetails.fromResult(result);
  return {
    reason: details.reason,
    errorCode: details.ErrorCode ?? details.errorCode,
    errorDetails: details.errorDetails
  };
}
```

---

## 5) Empfehlungen für deinen PoC

1. **SDK im Main-Prozess** nutzen, UI nur über IPC anbinden.
2. Für beide Quellen je **eigener Push-Stream + eigener Transcriber**.
3. Diarization als **Best-Effort** markieren (wie entschieden).
4. Latenz < 5s mit kleinen Chunkgrößen und stabilen Buffern validieren.
5. Loopback-Ausfall als harter Blocker behandeln (wie spezifiziert).

---

## Zusatzbefund: MAS V2 Echo Cancellation (C#/C++) vs. JavaScript

- Die Learn-Seite zu model-basierter Echo Cancellation (AUDIO_INPUT_PROCESSING_ENABLE_V2) zeigt Beispiele für **C# und C++**.
- In der Sprach-/Plattformtabelle sind ebenfalls **C# und C++ auf Windows x64/ARM64** ausgewiesen.
- In der JavaScript-SDK-Paketoberfläche (v1.50.0) sind Typen/Methoden wie `AudioProcessingOptions`, `SpeakerReferenceChannel`, `AUDIO_INPUT_PROCESSING_ENABLE_V2` nicht verfügbar.
- Schlussfolgerung für JS: Die gezeigte MAS-V2-Integration ist im JS-SDK derzeit nicht als direkte API exponiert.

## 6) Verwendete Dokumentationsquellen

- NPM Paket: `microsoft-cognitiveservices-speech-sdk` (v1.50.0)
- Microsoft Learn API Reference (azure-node-latest), inkl. `AudioConfig`
- Microsoft Learn Quickstart STT (JavaScript include)
- Microsoft Learn Quickstart Real-time Diarization (TypeScript/JavaScript Pivot)
- Paket-Typdefinitionen (`.d.ts`) und JS-Implementierung aus npm tarball (Methodensignaturen + Laufzeitverhalten)
- Ergänzende Fundstelle: GitHub Issue `Azure-Samples/cognitive-services-speech-sdk#583` (typischer Fehlgebrauch von `FromDefaultSpeakerOutput` in STT)
