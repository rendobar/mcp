# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `@rendobar/mcp`, please report it
privately. **Do not open a public GitHub issue for security problems.**

- Email: **security@rendobar.com**
- Or use GitHub's [private vulnerability reporting](https://github.com/rendobar/mcp/security/advisories/new).

Please include steps to reproduce, affected versions, and any relevant logs.
We aim to acknowledge reports within 2 business days and to ship a fix or
mitigation as quickly as the severity warrants.

## Supported Versions

The latest published `@rendobar/mcp` release on npm receives security updates.
Please upgrade before reporting an issue to confirm it still reproduces.

## Handling of Credentials

This server reads a Rendobar API key from `--api-key`, the `RENDOBAR_API_KEY`
environment variable, or a local credentials file. The key is never logged and
is sent only to the configured Rendobar API base (`https://api.rendobar.com` by
default) over HTTPS. The server starts without a key so hosts can list its
tools; tool execution requires the key.
