export type Capability =
  | "fs:read"
  | "fs:write"
  | "net"
  | "shell"
  | "env"
  | "obfuscated";

export type RiskLevel = "low" | "med" | "high";

export interface Finding {
  id: string;
  weight: number;
  reason: string;
  capability?: Capability;
}

export interface PackageContext {
  name: string;
  version: string;
  sizeBytes?: number;
  publishedAt?: string;
  publisher?: string;
  deprecated?: boolean;
  manifest: Record<string, unknown>;
  dir: string;
}

export interface Verdict {
  package: {
    name: string;
    version: string;
    sizeBytes?: number;
    publishedAt?: string;
    publisher?: string;
    repository?: string;
  };
  capabilities: Capability[];
  findings: Finding[];
  risk: { score: number; level: RiskLevel };
}
