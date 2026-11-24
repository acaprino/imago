# Throwaway: the text of the demo's real window, gray or with the colour fringes of ClearType.
param([string]$Exe, [string]$Data, [string]$Out)
$ErrorActionPreference = 'Stop'
$Data = [IO.Path]::GetFullPath($Data); $Out = [IO.Path]::GetFullPath($Out)
New-Item -ItemType Directory -Force $Data, $Out | Out-Null
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  public delegate bool Visit(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visit v, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref P p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  public static IntPtr Find(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); var s = new StringBuilder(200); GetClassNameW(h, s, 200);
      if (p == pid && s.ToString() == "Tauri Window" && IsWindowVisible(h)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found; }
}
'@
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
$null = [W]::SetProcessDpiAwarenessContext([IntPtr](-4))
$script:bad = 0
function Say($ok, $what) { if ($ok) { Write-Host "PASS  $what" } else { Write-Host "FAIL  $what"; $script:bad++ } }
$env:IMAGO_DEMO_HOME = $Data
$env:WEBVIEW2_USER_DATA_FOLDER = [IO.Path]::Combine($Data, 'webview')
Write-Host "Windows $((Get-CimInstance Win32_OperatingSystem).Version), font smoothing $((Get-ItemProperty 'HKCU:\Control Panel\Desktop').FontSmoothing), type $((Get-ItemProperty 'HKCU:\Control Panel\Desktop').FontSmoothingType)"

# How a word's pixels lie between its ground and its ink, in each channel: the same in all three is gray.
function Fringes([System.Drawing.Bitmap]$map, $box, $ground, $ink) {
  $inked = 0; $coloured = 0; $worst = 0.0
  for ($y = $box[1]; $y -lt $box[3]; $y++) { for ($x = $box[0]; $x -lt $box[2]; $x++) {
    $c = $map.GetPixel($x, $y)
    $a = @((($c.R - $ground[0]) / ($ink[0] - $ground[0])), (($c.G - $ground[1]) / ($ink[1] - $ground[1])), (($c.B - $ground[2]) / ($ink[2] - $ground[2])))
    $most = ($a | Measure-Object -Maximum).Maximum; $least = ($a | Measure-Object -Minimum).Minimum
    if ($most -gt 0.1) { $inked++; if (($most - $least) -gt 0.1) { $coloured++ }; if (($most - $least) -gt $worst) { $worst = $most - $least } }
  } }
  "$inked|$coloured|$([Math]::Round($worst, 2))"
}

$demo = Start-Process $Exe -PassThru; $null = $demo.Handle
$window = [IntPtr]::Zero
for ($k = 0; $k -lt 200 -and $window -eq [IntPtr]::Zero; $k++) { Start-Sleep -Milliseconds 100; $window = [W]::Find([uint32]$demo.Id) }
Start-Sleep 4
$engine = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -match 'demo-data' -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
Write-Host "engine: $($engine.CommandLine)"
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$map = New-Object System.Drawing.Bitmap $b.Width, $b.Height
[System.Drawing.Graphics]::FromImage($map).CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$map.Save("$Out/window.png")
$o = New-Object W+P; $null = [W]::ClientToScreen($window, [ref]$o)
$f = Fringes $map @(($o.X + 212), ($o.Y + 8), ($o.X + 430), ($o.Y + 36)) @(18, 22, 30) @(154, 165, 184)
$inked, $coloured, $worst = $f.Split('|')
Write-Host "client at $($o.X),$($o.Y); the unchosen tabs: $inked inked pixels, $coloured with a colour fringe, the widest $worst"
Say ([int]$inked -gt 200) 'there is text to look at'
Say ([int]$coloured -eq 0) "no pixel of the text has a colour fringe ($coloured of $inked)"
foreach ($argument in 'msWebOOUI', 'msPdfOOUI', 'msSmartScreenProtection', '--autoplay-policy=no-user-gesture-required', '--disable-lcd-text') { Say ($engine.CommandLine.Contains($argument)) "the engine was given $argument" }
Stop-Process -Id $demo.Id -Force
Write-Host "failures: $script:bad"
exit $script:bad
