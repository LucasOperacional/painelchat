import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/github";

async function githubFetch(path: string) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["GITHUB_API_KEY"];
  if (!lovableKey || !connKey) {
    throw new Error(
      "A conexão com o GitHub ainda não está ligada a este projeto. Conecte o GitHub no menu de conectores do Lovable.",
    );
  }
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0") {
      throw new Error("Limite de uso do GitHub atingido. Tente novamente em alguns minutos.");
    }
    if (res.status === 401) {
      throw new Error(
        "A conexão com o GitHub expirou. Reautorize o GitHub nos conectores do Lovable.",
      );
    }
    throw new Error(`GitHub respondeu ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export type GithubRepoResumo = {
  fullName: string;
  name: string;
  description: string;
  private: boolean;
  updatedAt: string;
  defaultBranch: string;
  htmlUrl: string;
  language: string;
};

export const listGithubRepos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const usuario = (await githubFetch("/user")) as { login?: string };
    const repos = (await githubFetch(
      "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    )) as Array<Record<string, unknown>>;
    const lista: GithubRepoResumo[] = (Array.isArray(repos) ? repos : []).map((r) => ({
      fullName: String(r["full_name"] ?? ""),
      name: String(r["name"] ?? ""),
      description: String(r["description"] ?? ""),
      private: Boolean(r["private"]),
      updatedAt: String(r["updated_at"] ?? ""),
      defaultBranch: String(r["default_branch"] ?? "main"),
      htmlUrl: String(r["html_url"] ?? ""),
      language: String(r["language"] ?? ""),
    }));
    return { login: String(usuario?.login ?? ""), repos: lista };
  });

const repoInfoSchema = z.object({
  fullName: z.string().trim().regex(/^[\w.-]+\/[\w.-]+$/, "Repositório inválido"),
});

export const getGithubRepoInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => repoInfoSchema.parse(data))
  .handler(async ({ data }) => {
    const repo = data.fullName;
    const [repoBase, commits, branches, languages, issues] = await Promise.all([
      githubFetch(`/repos/${repo}`) as Promise<Record<string, unknown>>,
      (githubFetch(`/repos/${repo}/commits?per_page=8`) as Promise<unknown>).catch(() => []),
      (githubFetch(`/repos/${repo}/branches?per_page=30`) as Promise<unknown>).catch(() => []),
      (githubFetch(`/repos/${repo}/languages`) as Promise<unknown>).catch(() => null),
      (githubFetch(`/repos/${repo}/issues?state=open&per_page=5&sort=updated`) as Promise<unknown>).catch(() => []),
    ]);

    const owner = (repoBase["owner"] ?? {}) as Record<string, unknown>;
    const commitsLista = Array.isArray(commits) ? (commits as Array<Record<string, unknown>>) : [];
    const branchesLista = Array.isArray(branches) ? (branches as Array<Record<string, unknown>>) : [];
    const issuesLista = Array.isArray(issues) ? (issues as Array<Record<string, unknown>>) : [];
    const idiomas = (languages && typeof languages === "object" ? languages : {}) as Record<string, number>;

    return {
      fullName: String(repoBase["full_name"] ?? repo),
      name: String(repoBase["name"] ?? ""),
      description: String(repoBase["description"] ?? ""),
      private: Boolean(repoBase["private"]),
      htmlUrl: String(repoBase["html_url"] ?? ""),
      defaultBranch: String(repoBase["default_branch"] ?? "main"),
      language: String(repoBase["language"] ?? ""),
      stars: Number(repoBase["stargazers_count"] ?? 0),
      forks: Number(repoBase["forks_count"] ?? 0),
      watchers: Number(repoBase["watchers_count"] ?? 0),
      openIssues: Number(repoBase["open_issues_count"] ?? 0),
      sizeKb: Number(repoBase["size"] ?? 0),
      createdAt: String(repoBase["created_at"] ?? ""),
      updatedAt: String(repoBase["updated_at"] ?? ""),
      pushedAt: String(repoBase["pushed_at"] ?? ""),
      avatarUrl: String(owner["avatar_url"] ?? ""),
      ownerLogin: String(owner["login"] ?? ""),
      commits: commitsLista.map((c) => {
        const commit = (c["commit"] ?? {}) as Record<string, unknown>;
        const author = (commit["author"] ?? {}) as Record<string, unknown>;
        return {
          sha: String(c["sha"] ?? "").slice(0, 7),
          message: String(commit["message"] ?? "").split("\n")[0],
          author: String(author["name"] ?? ""),
          date: String(author["date"] ?? ""),
        };
      }),
      branches: branchesLista.map((b) => ({
        name: String((b as Record<string, unknown>)["name"] ?? ""),
        protectedBranch: Boolean((b as Record<string, unknown>)["protected"]),
      })),
      languages: Object.entries(idiomas)
        .sort((a, b) => b[1] - a[1])
        .map(([name, bytes]) => ({ name, bytes: Number(bytes) })),
      issues: issuesLista.map((i) => ({
        number: Number(i["number"] ?? 0),
        title: String(i["title"] ?? ""),
        state: String(i["state"] ?? "open"),
        htmlUrl: String(i["html_url"] ?? ""),
        updatedAt: String(i["updated_at"] ?? ""),
      })),
    };
  });

export type GithubRepoInfo = Awaited<ReturnType<typeof getGithubRepoInfo>>;
