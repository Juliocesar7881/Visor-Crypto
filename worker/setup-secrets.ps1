param(
    [switch]$SkipGroq
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-SecureToPlainText {
    param([Parameter(Mandatory = $true)][Security.SecureString]$Secure)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    }
    finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

Set-Location $PSScriptRoot

Write-Host "Cloudflare Worker secret setup" -ForegroundColor Cyan
Write-Host "Project: visor-crypto-calendar" -ForegroundColor DarkCyan

$fmpSecure = Read-Host "Enter FMP_API_KEY" -AsSecureString
$fredSecure = Read-Host "Enter FRED_API_KEY" -AsSecureString

$fmp = Convert-SecureToPlainText -Secure $fmpSecure
$fred = Convert-SecureToPlainText -Secure $fredSecure

if ([string]::IsNullOrWhiteSpace($fmp)) { throw "FMP_API_KEY is required." }
if ([string]::IsNullOrWhiteSpace($fred)) { throw "FRED_API_KEY is required." }

$fmp | npx wrangler secret put FMP_API_KEY | Out-Null
$fred | npx wrangler secret put FRED_API_KEY | Out-Null

if (-not $SkipGroq) {
    $groqSecure = Read-Host "Enter GROQ_API_KEY (optional)" -AsSecureString
    $groq = Convert-SecureToPlainText -Secure $groqSecure
    if (-not [string]::IsNullOrWhiteSpace($groq)) {
        $groq | npx wrangler secret put GROQ_API_KEY | Out-Null
    }
}

Write-Host "Secrets configured successfully." -ForegroundColor Green
Write-Host "Current secret names:" -ForegroundColor DarkCyan
npx wrangler secret list
