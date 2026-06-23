import packager from 'electron-packager'

const allowedPaths = [
  '/out',
  '/package.json'
]

function shouldIgnore(candidatePath) {
  const normalizedPath = candidatePath.replaceAll('\\', '/').replace(/^\.(?=\/|$)/, '') || '/'

  if (normalizedPath === '/') {
    return false
  }

  return !allowedPaths.some((allowedPath) => (
    normalizedPath === allowedPath || normalizedPath.startsWith(`${allowedPath}/`)
  ))
}

await packager({
  dir: '.',
  name: 'meeting-notes',
  platform: 'win32',
  arch: 'x64',
  out: 'dist/portable',
  overwrite: true,
  extraResource: ['sidecar/publish/sidecar'],
  ignore: shouldIgnore
})
