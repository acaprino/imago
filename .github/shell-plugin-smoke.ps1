param([string]$Exe, [string]$Data)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class W {
  public delegate bool Visit(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rr, B; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visit v, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  public static List<string> Of(uint pid) {
    var found = new List<string>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) { var t = new StringBuilder(200); GetWindowTextW(h, t, 200); var c = new StringBuilder(200); GetClassNameW(h, c, 200); R r; GetWindowRect(h, out r);
        if (c.ToString() == "Tauri Window" || t.Length > 0) found.Add(h.ToInt64() + "|" + c + "|" + t + "|" + r.L + "," + r.T + "," + (r.Rr - r.L) + "x" + (r.B - r.T)); }
      return true; }, IntPtr.Zero);
    return found; }
}
'@
$script:bad = 0
function Say($ok, $what) { if ($ok) { Write-Host "PASS  $what" } else { Write-Host "FAIL  $what"; $script:bad++ } }
function Wait-For([scriptblock]$done, [int]$seconds) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $seconds) { $value = & $done; if ($value) { return $value }; Start-Sleep -Milliseconds 200 }
  return $null
}
function Visible($p) { [W]::Of([uint32]$p.Id) }
function Engine($p, [string]$type) {
  $all = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'"
  $mine = $all | Where-Object { $_.ParentProcessId -eq $p.Id -and $_.CommandLine -notmatch '--type=' }
  if ($type -eq 'browser') { return $mine }
  return $all | Where-Object { $_.CommandLine -match "--type=$type" -and ($mine.ProcessId -contains $_.ParentProcessId) }
}
function Call($command, $arguments) {
  $script = "window.__TAURI_INTERNALS__.invoke('plugin:imago-shell|$command', $arguments).then(() => 'ok', (e) => 'error: ' + JSON.stringify(e))"
  return Evaluate $script
}
function Evaluate($expression) {
  $page = (Invoke-RestMethod 'http://127.0.0.1:9333/json') | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
  $socket = [Net.WebSockets.ClientWebSocket]::new()
  $none = [Threading.CancellationToken]::None
  $socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $none).Wait()
  $message = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expression; awaitPromise = $true; returnByValue = $true } } | ConvertTo-Json -Depth 5 -Compress
  $socket.SendAsync([ArraySegment[byte]][Text.Encoding]::UTF8.GetBytes($message), 'Text', $true, $none).Wait()
  $buffer = [byte[]]::new(65536)
  $got = $socket.ReceiveAsync([ArraySegment[byte]]$buffer, $none).Result
  $socket.Dispose()
  return ([Text.Encoding]::UTF8.GetString($buffer, 0, $got.Count) | ConvertFrom-Json).result.result.value
}
function Start-Demo { Start-Process $Exe -PassThru }

Add-Type -AssemblyName System.Windows.Forms
Write-Host "work area: $([System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea)"
$env:IMAGO_DEMO_HOME = $Data
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9333 --remote-debugging-address=127.0.0.1'

$demo = Start-Demo
$null = $demo.Handle
Start-Sleep -Milliseconds 700
Write-Host "0.7 s after the start, visible: $((Visible $demo) -join ' ; ')"
$shown = Wait-For { Visible $demo } 20
Say $shown "the window is shown: $shown, after $([int]((Get-Date) - $demo.StartTime).TotalMilliseconds) ms"

$port = Wait-For { try { (Invoke-RestMethod 'http://127.0.0.1:9333/json/version' -TimeoutSec 2).Browser } catch { $null } } 10
Write-Host "debugging port: $(if ($port) { $port } else { 'not opened' })"
if ($port) {
  foreach ($c in @(@('set_theme', "{theme:'light',resolved:'light'}"), @('caption', '{x:900,y:0,width:46,height:32}'), @('ready', '{}'), @('chrome', "{title:'Smoke',progress:40}"), @('set_theme', "{theme:'purple'}"))) {
    Write-Host "page calls $($c[0]) $($c[1]): $(Call $c[0] $c[1])"
  }
  Say ((Get-Content "$Data/window-theme") -eq 'light') 'set_theme kept the theme'
  Say (@(Visible $demo) -match '\|Smoke\|') "chrome set the title: $((Visible $demo) -join ' ; ')"
  Write-Host "media after set_theme light: $(Evaluate "matchMedia('(prefers-color-scheme: light)').matches")"
  Write-Host "window.open: $(Evaluate "String(window.open('https://example.com/'))"); other origin refused: $(Evaluate "location.href='https://example.com/'; new Promise(r => setTimeout(() => r(location.href), 1500))")"
}

$second = Start-Demo
$ended = $second.WaitForExit(15000)
Say ($ended -and -not $demo.HasExited) "a second start ends by itself ($ended) and the first lives"

$renderer = Engine $demo 'renderer' | Select-Object -First 1
$renderer | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
$again = Wait-For { Engine $demo 'renderer' | Where-Object { $_.ProcessId -ne $renderer.ProcessId } } 15
Say ($again -and -not $demo.HasExited) "a killed renderer comes back ($($renderer.ProcessId) -> $($again.ProcessId))"
Start-Sleep 2

$before = @(Visible $demo)[0]
$browser = Engine $demo 'browser' | Select-Object -First 1
Stop-Process -Id $browser.ProcessId -Force
Start-Sleep 1
Write-Host "1 s after the browser process was killed: $((Visible $demo) -join ' ; ')"
$rebuilt = Wait-For { if ($demo.HasExited) { 'exited' } else { @(Visible $demo) | Where-Object { $_.Split('|')[0] -ne $before.Split('|')[0] -and $_ -match 'Tauri Window' } } } 25
Say ($rebuilt -and $rebuilt -ne 'exited') "a killed browser process: a new window in place of the old ($before -> $rebuilt)"
Say ($rebuilt -and ("$rebuilt".Split('|')[3] -eq $before.Split('|')[3])) 'the new window is where the old was'
Start-Sleep 4
Say (Engine $demo 'browser') 'and it has an engine again'

$handle = [IntPtr][int64]("$(@(Visible $demo)[0])".Split('|')[0])
$null = [W]::SetWindowPos($handle, [IntPtr]::Zero, 120, 60, 700, 560, 0x14)
Start-Sleep 1
$moved = @(Visible $demo)[0]
$null = [W]::PostMessageW($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
$ended = $demo.WaitForExit(15000)
Say ($ended -and $demo.ExitCode -eq 0) "closing ends the program (ended $ended, code $($demo.ExitCode))"
Write-Host "window.json: $((Get-Content "$Data/window.json" -Raw -ErrorAction SilentlyContinue) -replace '\s+', ' ')"
Start-Sleep 2
$left = @(Get-Process imago-demo -ErrorAction SilentlyContinue).Count
Say ($left -eq 0) "no copy is left ($left)"

$demo = Start-Demo
$null = $demo.Handle
$shown = @(Wait-For { Visible $demo } 20)[0]
Say ($shown -and $shown.Split('|')[3] -eq $moved.Split('|')[3]) "a restart opens where it was: $moved -> $shown"
$handle = [IntPtr][int64]("$shown".Split('|')[0])
$null = [W]::PostMessageW($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
$null = $demo.WaitForExit(15000)
if (-not $demo.HasExited) { Stop-Process -Id $demo.Id -Force }
Write-Host "failures: $script:bad"
exit $script:bad
