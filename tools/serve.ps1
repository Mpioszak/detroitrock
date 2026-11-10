# Local preview for Detroit Rock.
#
# The site reads its JSON files over http, so double-clicking index.html does
# not work. Run this instead, then open http://localhost:8080/ in a browser:
#
#   powershell -ExecutionPolicy Bypass -File tools\serve.ps1
#
# Press Ctrl+C to stop. Nothing is installed and nothing leaves this computer.

param([int]$Port = 8080)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Could not start on port $Port (is another preview already running?). Try: tools\serve.ps1 -Port 8090"
  exit 1
}
Write-Host "Detroit Rock preview: http://localhost:$Port/   (data check: http://localhost:$Port/check.html)"
Write-Host 'Press Ctrl+C to stop.'

try {
  while ($listener.IsListening) {
    # Wait in short slices so Ctrl+C is noticed.
    $pending = $listener.GetContextAsync()
    while (-not $pending.AsyncWaitHandle.WaitOne(250)) { }
    $context = $pending.GetAwaiter().GetResult()
    $response = $context.Response
    try {
      $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
      if ($relative -eq '' -or $relative.EndsWith('/')) { $relative += 'index.html' }
      $path = [IO.Path]::GetFullPath((Join-Path $root $relative))
      $inside = $path.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
      if ($inside -and (Test-Path -LiteralPath $path -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($path)
        $type = $types[[IO.Path]::GetExtension($path).ToLower()]
        if (-not $type) { $type = 'application/octet-stream' }
        $response.ContentType = $type
        $response.Headers['Cache-Control'] = 'no-store'
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $response.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
        $response.ContentType = 'text/plain; charset=utf-8'
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } catch {
      # A browser that hangs up early is not worth stopping the preview for.
    } finally {
      $response.Close()
    }
  }
} finally {
  $listener.Stop()
}
