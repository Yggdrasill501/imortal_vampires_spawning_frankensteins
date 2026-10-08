/** The on-disk contract a generated tool must satisfy before it joins the shelf. */
export interface ToolMeta {
  name: string;
  description: string;
  sites: string[];
  connectors: string[];
  effect: "reads" | "writes";
  lists_items: boolean;
  input: Record<string, string>;
  output: Record<string, string>;
}

export interface ToolVersion {
  name: string;
  version: number;
  folder: string;
  codePath: string;
  meta: ToolMeta;
}

export interface InvitationScope {
  sites: readonly string[];
  connectors: readonly string[];
}

export interface InstallIssue {
  message: string;
  site?: string;
  connector?: string;
}

export interface InstallCheck {
  passed: boolean;
  tool: ToolVersion | null;
  issues: InstallIssue[];
}
