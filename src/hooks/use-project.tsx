import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";

import { applyBrandingColors } from "@/lib/branding-themes";
import { getProjectByHost, type ProjectBranding } from "@/lib/projects.functions";

/**
 * Resolves the project (tenant) that answers for the current domain and applies
 * its identity (name, logo, favicon, colors) on top of the shared layout.
 * APIs and integrations stay centralized in the master project.
 */
export function useProjectBranding() {
  const resolve = useServerFn(getProjectByHost);

  const query = useQuery({
    queryKey: ["project-branding"],
    queryFn: () => resolve({ data: { host: window.location.hostname } }),
    staleTime: 5 * 60 * 1000,
  });

  const project = (query.data ?? null) as ProjectBranding | null;

  useEffect(() => {
    if (!project) return;
    const root = document.documentElement;
    if (project.primaryColor && project.accentColor) {
      applyBrandingColors(project.primaryColor, project.accentColor);
    }
    if (project.headline) document.title = project.headline;
    if (project.faviconUrl) {
      let icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!icon) {
        icon = document.createElement("link");
        icon.rel = "icon";
        document.head.appendChild(icon);
      }
      icon.href = project.faviconUrl;
    }
  }, [project]);

  return { project, isLoading: query.isLoading };
}
