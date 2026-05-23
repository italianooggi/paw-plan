# Gentleman Guardian Angel (GGA) Validation Hook for Windows
# ASCII Only - Pure Text - No Emojis

$ErrorActionPreference = "Stop"

Write-Output "--- GGA Validation Hook Started ---"

# 1. Branch Validation
$branch = (git branch --show-current).Trim()
Write-Output "Checking active branch: $branch"

if ($branch -eq "main" -or $branch -eq "dev") {
    Write-Error "ERROR: Direct commits to '$branch' are blocked by GGA. Use features or bugfix branches."
    exit 1
}

if ($branch -notmatch "^(feat|fix|chore|docs|refactor|test)/.+$") {
    Write-Error "ERROR: Branch name '$branch' must follow pattern prefix: feat/, fix/, chore/, docs/, refactor/, test/"
    exit 1
}

# 2. Conventional Commits Validation (Last Local Commit)
$hasCommits = git rev-parse --verify HEAD 2>$null
if ($null -ne $hasCommits) {
    $lastCommitMsg = (git log -1 --pretty=%B).Trim()
    Write-Output "Checking last commit message: $lastCommitMsg"
    if ($lastCommitMsg -notmatch "^(feat|fix|chore|docs|refactor|test|revert)(\([a-zA-Z0-9_\-\/]+\))?!?: .+$") {
        Write-Warning "WARNING: Last commit message does not conform to Conventional Commits format."
        Write-Warning "Format should be: type(scope): description"
    }
}

# 3. Secret Scanning (Critical)
Write-Output "Scanning staged files for hardcoded secrets..."

$stagedFiles = git diff --cached --name-only
if ($stagedFiles.Count -eq 0 -or $null -eq $stagedFiles) {
    Write-Output "No staged files to scan."
} else {
    $secretsFound = 0
    # Common regex patterns for secrets
    $patterns = @{
        'Private Key' = '-----BEGIN [A-Z ]+ PRIVATE KEY-----'
        'AWS Access Key' = 'AKIA[0-9A-Z]{16}'
        'Slack Webhook' = 'https://hooks.slack.com/services/T[A-Z0-9]+/B[A-Z0-9]+/([a-zA-Z0-9]{24})'
        'Hardcoded Credential' = '(?i)(password|passwd|api_key|apikey|secret|token|private_key|auth_token)\s*[:=]\s*[''"][a-zA-Z0-9_\-\.\~]{10,}[''"]'
    }

    # Retrieve cached diff (only lines added, starting with '+', excluding '+++')
    $diffLines = git diff --cached --unified=0 | Where-Object { $_ -like "+*" -and $_ -notlike "+++*" }
    
    foreach ($line in $diffLines) {
        $cleanLine = $line.Substring(1) # Remove the '+' prefix
        foreach ($key in $patterns.Keys) {
            $pattern = $patterns[$key]
            if ($cleanLine -match $pattern) {
                # Ignore common templates or config placeholders
                if ($cleanLine -notmatch "process\.env" -and $cleanLine -notmatch "placeholder" -and $cleanLine -notmatch "mySecret") {
                    Write-Error "CRITICAL ERROR: Potential secret detected! ($key)"
                    Write-Error "Matching line: $cleanLine"
                    $secretsFound++
                }
            }
        }
    }

    if ($secretsFound -gt 0) {
        Write-Error "ERROR: Commit aborted. Remove hardcoded secrets and try again."
        exit 1
    } else {
        Write-Output "Staged files look clean."
    }
}

Write-Output "--- GGA Validation Passed ---"
exit 0
