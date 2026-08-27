/**
 * Azure AD / Entra ID OIDC stub.
 * Full token exchange is out of scope; keep this surface stable for a future pass.
 */

export interface AzureConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  publicBaseUrl: string;
}

export class AzureOidcProvider {
  isConfigured(): boolean {
    return Boolean(this.readConfig());
  }

  readConfig(): AzureConfig | null {
    const tenantId = process.env.AZURE_AD_TENANT_ID?.trim();
    const clientId = process.env.AZURE_AD_CLIENT_ID?.trim();
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET?.trim();
    const publicBaseUrl = process.env.AE_PUBLIC_BASE_URL?.trim();
    if (!tenantId || !clientId || !clientSecret || !publicBaseUrl) return null;
    return { tenantId, clientId, clientSecret, publicBaseUrl };
  }

  getAuthorizeUrl(_state: string): string {
    const cfg = this.readConfig();
    if (!cfg) {
      throw new Error("Azure AD is not configured");
    }
    // Reserved for future OIDC authorize redirect.
    throw new Error("Azure AD sign-in is not implemented yet");
  }

  async handleCallback(_code: string, _state: string): Promise<never> {
    throw new Error("Azure AD sign-in is not implemented yet");
  }
}
