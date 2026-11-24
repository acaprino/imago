param([string]$Exe, [string]$Data, [string]$Page)
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
  public static List<string> Of(uint pid, string cls) {
    var found = new List<string>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) { var t = new StringBuilder(400); GetWindowTextW(h, t, 400); var c = new StringBuilder(200); GetClassNameW(h, c, 200); R r; GetWindowRect(h, out r);
        if (c.ToString() == cls) found.Add(h.ToInt64() + "|" + t + "|" + r.L + "," + r.T + "," + (r.Rr - r.L) + "x" + (r.B - r.T)); }
      return true; }, IntPtr.Zero);
    return found; }
}
'@
$script:bad = 0
function Say($ok, $what) { if ($ok) { Write-Host "PASS  $what" } else { Write-Host "FAIL  $what"; $script:bad++ } }
function Wait-For([scriptblock]$done, [int]$seconds) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $seconds) { $value = & $done; if ($value) { return $value }; Start-Sleep -Milliseconds 100 }
  return $null
}
function Main($p) { @([W]::Of([uint32]$p.Id, 'Tauri Window'))[0] }
function Title($p) { "$(Main $p)".Split('|')[1] }
function Box($p) { @([W]::Of([uint32]$p.Id, '#32770'))[0] }
function Engine($p, [string]$type) {
  $all = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'"
  $mine = $all | Where-Object { $_.ParentProcessId -eq $p.Id -and $_.CommandLine -notmatch '--type=' }
  if ($type -eq 'browser') { return $mine }
  return $all | Where-Object { $_.CommandLine -match "--type=$type" -and ($mine.ProcessId -contains $_.ParentProcessId) }
}
function Kill-Engine($p, $type) { Engine $p $type | Select-Object -First 1 | ForEach-Object { Stop-Process -Id $_.ProcessId -Force } }
function Start-Server { Start-Process python -ArgumentList '-I', "$PSScriptRoot/shell-plugin-server.py", $Page -PassThru -WindowStyle Hidden }
function Start-Demo { $p = Start-Process $Exe -PassThru; $null = $p.Handle; $p }
function Close-Demo($p) {
  $null = [W]::PostMessageW([IntPtr][int64]("$(Main $p)".Split('|')[0]), 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  $null = $p.WaitForExit(15000)
  Say ($p.HasExited -and $p.ExitCode -eq 0) "closing ends the program (code $($p.ExitCode))"
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  Start-Sleep 2
}

$env:IMAGO_DEMO_HOME = "$Data-embedded"
Write-Host '--- the embedded page'
$demo = Start-Demo
$title = Wait-For { $t = Title $demo; if ($t -match '^Smoke') { $t } } 25
Say ($title -match 'tauri.localhost set_theme:ok caption:ok chrome:ok ready:ok') "the page calls the four commands: $title"
Say ((Get-Content "$env:IMAGO_DEMO_HOME/window-theme" -ErrorAction SilentlyContinue) -eq 'light') 'the theme is kept'
Close-Demo $demo

$env:IMAGO_DEMO_HOME = "$Data-remote"
$env:SMOKE_URL = 'http://127.0.0.1:50777/index.html?token=x'
Write-Host '--- a page on http://127.0.0.1, with a policy that has no connect-src'
$server = Start-Server
Start-Sleep 2
$demo = Start-Demo
$title = Wait-For { $t = Title $demo; if ($t -match '^Smoke') { $t } } 25
Say ($title -match '127.0.0.1:50777 set_theme:ok caption:ok chrome:ok ready:ok') "the page calls the four commands: $title"
$still = Wait-For { $t = Title $demo; if ($t -match '^Still') { $t } } 15
Say ($still -match 'Still http://127.0.0.1:50777 open:null') "another origin and a new window are refused: $still"
$null = [W]::SetWindowPos([IntPtr][int64]("$(Main $demo)".Split('|')[0]), [IntPtr]::Zero, 120, 60, 700, 560, 0x14)
Start-Sleep 1
$before = Main $demo
Kill-Engine $demo 'browser'
$after = Wait-For { $m = Main $demo; if ($m -and $m.Split('|')[0] -ne $before.Split('|')[0] -and $m -match 'Still') { $m } } 30
Say ($after -and $after.Split('|')[2] -eq $before.Split('|')[2]) "a killed browser process: built again on its page, where it was: $before -> $after"

Stop-Process -Id $server.Id -Force
Kill-Engine $demo 'renderer'
$box = Wait-For { Box $demo } 40
Say $box "the server is down: after its reloads the person is asked: $box"
$server = Start-Server
Start-Sleep 2
$null = [W]::PostMessageW([IntPtr][int64]("$box".Split('|')[0]), 0x0111, [IntPtr]6, [IntPtr]::Zero)
$reloaded = Wait-For { if (-not (Box $demo)) { Engine $demo 'renderer' } } 15
$null = [W]::PostMessageW([IntPtr][int64]("$(Main $demo)".Split('|')[0]), 0, [IntPtr]::Zero, [IntPtr]::Zero)
Say ($reloaded -and -not $demo.HasExited) 'Yes reloads it'
Write-Host "requests the server saw since its restart: $((Get-Content "$PSScriptRoot/../server.log" -ErrorAction SilentlyContinue | Select-Object -Last 6) -join ' ; ')"
Close-Demo $demo
Stop-Process -Id $server.Id -Force
Write-Host "failures: $script:bad"
exit $script:bad
