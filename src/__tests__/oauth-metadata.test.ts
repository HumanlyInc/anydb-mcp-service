import { describe, expect, it } from "@jest/globals";
import {
  buildAuthenticateHeader,
  protectedResourceMetadata,
  resourceMetadataUrl,
} from "../oauth/metadata.js";
import { config } from "../config.js";

describe("protected resource metadata", () => {
  it("advertises the resource and its authorization server", () => {
    const doc = protectedResourceMetadata();
    expect(doc.resource).toBe(config.oauth.resourceUri);
    expect(doc.authorization_servers).toEqual([config.oauth.issuer]);
    expect(doc.bearer_methods_supported).toEqual(["header"]);
  });

  it("advertises every scope the verifier recognizes", () => {
    expect(protectedResourceMetadata().scopes_supported).toEqual([
      "mcp:read",
      "mcp:write",
      "mcp:author",
    ]);
  });

  it("derives the metadata URL from the resource URI", () => {
    expect(resourceMetadataUrl()).toBe(
      `${config.oauth.resourceUri}/.well-known/oauth-protected-resource`,
    );
  });
});

describe("WWW-Authenticate challenge", () => {
  it("always points at the resource metadata so clients can discover the AS", () => {
    expect(buildAuthenticateHeader()).toBe(
      `Bearer resource_metadata="${resourceMetadataUrl()}"`,
    );
  });

  it("includes the error code and description when given", () => {
    const header = buildAuthenticateHeader({
      error: "invalid_token",
      description: "token is expired",
    });
    expect(header).toContain('error="invalid_token"');
    expect(header).toContain('error_description="token is expired"');
  });

  it("includes the required scope on an insufficient_scope challenge", () => {
    const header = buildAuthenticateHeader({
      error: "insufficient_scope",
      scope: "mcp:read",
    });
    expect(header).toContain('scope="mcp:read"');
  });

  it("strips quotes and backslashes that would break header parsing", () => {
    const header = buildAuthenticateHeader({
      error: "invalid_token",
      description: 'bad "quoted" \\ value',
    });
    expect(header).toBe(
      `Bearer resource_metadata="${resourceMetadataUrl()}", error="invalid_token", error_description="bad quoted  value"`,
    );
  });
});
