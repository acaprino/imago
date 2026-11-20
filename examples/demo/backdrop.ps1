param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  # The colour of the window behind the demo window: "12,12,12" is a dark one, "255,255,255" a bright one.
  [Parameter(Mandatory = $true)][string]$Color,
  # How far the backdrop reaches past the demo window on every side, in physical pixels.
  [int]$Margin = 60,
  # Extra room below the demo window, for the flyout that Snap Layouts opens under the maximize button.
  [int]$Below = 0,
  # It closes itself after this long, so a run that dies leaves nothing on the screen.
  [int]$Seconds = 240,
  # Experiments: lay the backdrop in the ordinary band instead of the topmost one.
  [switch]$NotTopmost
)
# A plain window of one colour behind the demo window, for the glass to blur: the acrylic is a blur of what lies
# behind the window, so the same glass is photographed over a dark and over a bright one. It never takes the
# focus (the demo window must stay the active one, or Windows drops the material) and has no taskbar button.
# It prints "ready" once it is shown and runs until it is stopped.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing @'
using System; using System.Windows.Forms;
public class BackdropForm : Form {
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams {
    get { CreateParams p = base.CreateParams; p.ExStyle |= 0x08000080; return p; }   // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW
  }
}
'@
Add-Type @'
using System; using System.Runtime.InteropServices;
public class BackdropNative {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  public struct R { public int L, T, Rr, B; }
}
'@
[BackdropNative]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
$handle = (Get-Process -Id $ProcessId).MainWindowHandle
$rect = New-Object BackdropNative+R
[BackdropNative]::GetWindowRect($handle, [ref]$rect) | Out-Null
$r, $g, $b = $Color -split ',' | ForEach-Object { [int]$_ }

$form = New-Object BackdropForm
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.ShowInTaskbar = $false
# Topmost like the demo window (which capture.ps1 raises above it): another window the person activates meanwhile
# must not come up between the two.
$form.TopMost = -not $NotTopmost
$form.BackColor = [System.Drawing.Color]::FromArgb($r, $g, $b)
$form.Bounds = New-Object System.Drawing.Rectangle ($rect.L - $Margin), ($rect.T - $Margin), (($rect.Rr - $rect.L) + 2 * $Margin), (($rect.B - $rect.T) + 2 * $Margin + $Below)
$form.Show()
'ready'
function Test-Running {
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  return ($null -ne $process) -and -not $process.HasExited
}
$until = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $until -and (Test-Running)) {
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 40
}
$form.Close()
