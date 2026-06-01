# syntax=docker/dockerfile:1
#
# Container image for the Rendobar MCP server (stdio transport).
# Used by Glama and other Docker-based MCP hosts to build and run a release.
#
# The server speaks JSON-RPC over stdin/stdout and logs to stderr. It needs
# RENDOBAR_API_KEY (a key starting with rb_). Auth is validated lazily on the
# first tool call, so a placeholder key is enough for a host to start the
# server and introspect the tool list for scoring.
FROM node:22-alpine

# Install the published package. Pin a version at build time with
# --build-arg MCP_VERSION=x.y.z; defaults to the latest release.
ARG MCP_VERSION=latest
RUN npm install -g @rendobar/mcp@${MCP_VERSION}

ENTRYPOINT ["rendobar-mcp"]
