param([Parameter(Mandatory=$true)][string]$Evidence)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type 'using System; using System.Runtime.InteropServices; public static class TargetWindow { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }'
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Canvas Desktop Test Target'
$form.Size = New-Object System.Drawing.Size(800,600)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [System.Drawing.Color]::LightBlue
$field = New-Object System.Windows.Forms.TextBox
$field.Location = New-Object System.Drawing.Point(40,70)
$field.Size = New-Object System.Drawing.Size(500,40)
$field.Text = 'underlying-target-'
$form.Controls.Add($field)
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Test underlying mouse input'
$button.Location = New-Object System.Drawing.Point(40,130)
$button.Size = New-Object System.Drawing.Size(240,40)
$form.Controls.Add($button)
$script:clicks = 0
function Save-ProbeState {
  $point = $button.PointToScreen((New-Object System.Drawing.Point(120,20)))
  [ordered]@{pid=$PID;handle=$form.Handle.ToInt64();text=$field.Text;clicks=$script:clicks;clickX=($point.X-$form.Bounds.X);clickY=($point.Y-$form.Bounds.Y)} | ConvertTo-Json | Set-Content (Join-Path $Evidence 'target-state.json') -Encoding UTF8
}
$button.add_Click({$script:clicks++;Save-ProbeState})
$field.add_TextChanged({Save-ProbeState})
$form.add_Shown({[void][TargetWindow]::ShowWindow($form.Handle,5);[void][TargetWindow]::SetForegroundWindow($form.Handle);$form.Activate();$field.Focus();$field.SelectionStart=$field.TextLength;Save-ProbeState})
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval=100
$timer.add_Tick({if(Test-Path -LiteralPath (Join-Path $Evidence 'stop-target')){$form.Close()}})
$timer.Start()
try {[System.Windows.Forms.Application]::Run($form)} finally {$timer.Dispose();$form.Dispose()}
