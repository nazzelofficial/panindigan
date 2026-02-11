# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Reporting a Vulnerability

We take the security of Panindigan seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please Do Not

- **Do not** open a public issue describing the vulnerability
- **Do not** share the vulnerability details on public forums or social media
- **Do not** submit a pull request with the fix without first coordinating with us

### Please Do

- **Do** report vulnerabilities privately via GitHub Security Advisories
- **Do** provide detailed information about the vulnerability
- **Do** include steps to reproduce the issue
- **Do** suggest possible mitigations if you have them

### How to Report

1. Go to the [Security Advisories](https://github.com/nazzelofficial/panindigan/security/advisories) page
2. Click "New draft security advisory"
3. Fill in the details about the vulnerability
4. Submit the report

### Response Timeline

- **Acknowledgment**: Within 48 hours of receiving your report
- **Initial Assessment**: Within 5 business days
- **Fix Timeline**: Depends on severity and complexity
  - Critical: 7 days
  - High: 14 days
  - Medium: 30 days
  - Low: 90 days
- **Public Disclosure**: After fix is released and users have had time to update

## Security Best Practices

When using Panindigan, please follow these security guidelines:

### AppState/Cookie Security

- **Never commit AppState or cookies to version control**
- Use environment variables for AppState in production
- Rotate your AppState periodically
- Store AppState securely (e.g., using secrets management tools)

### Environment Variables

```bash
# Good - Use environment variable
export FACEBOOK_APPSTATE='[{"key":"c_user","value":"..."}]'
```

```bash
# Bad - Never do this
const appState = [{key: "c_user", value: "123..."}]; // In source code
```

### Rate Limiting

- Respect Facebook's rate limits to avoid account restrictions
- Implement exponential backoff for retries
- Monitor for rate limit responses

### Session Management

- Enable session persistence for production use
- Validate sessions periodically
- Handle session expiration gracefully

## Known Security Considerations

1. **AppState Sensitivity**: AppState contains authentication tokens that grant access to your Facebook account. Treat it as a password.

2. **Man-in-the-Middle**: Always verify SSL certificates when connecting to Facebook's servers.

3. **Data Logging**: Be careful with debug logging in production as it may log sensitive information.

4. **Third-Party Dependencies**: We regularly audit our dependencies for security vulnerabilities.

## Security Updates

Security updates will be released as patch versions (e.g., 1.0.1) and announced via:

- GitHub Releases
- Security Advisories
- CHANGELOG.md

We recommend enabling automated security updates for this package.

## Disclaimer

This is an unofficial library and is not affiliated with Facebook/Meta. Users are responsible for complying with Facebook's Terms of Service. The authors are not responsible for any account restrictions or bans resulting from the use of this library.

## Acknowledgments

We thank the security researchers who have responsibly disclosed vulnerabilities to help make Panindigan safer for everyone.
