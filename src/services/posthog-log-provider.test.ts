// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

const { resourceFromAttributes } = vi.hoisted(() => ({ resourceFromAttributes: vi.fn() }));
vi.mock("@opentelemetry/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@opentelemetry/resources")>();
  resourceFromAttributes.mockImplementation(actual.resourceFromAttributes);
  return { ...actual, resourceFromAttributes };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  resourceFromAttributes.mockClear();
});

async function load() {
  return (await import("./posthog-log-provider")).getPostHogLogProvider;
}

describe("PostHog 로그 프로바이더", () => {
  it("설정이 있으면 한 번만 만들어 재사용합니다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    const getPostHogLogProvider = await load();

    const provider = getPostHogLogProvider();
    expect(provider).not.toBeNull();
    expect(getPostHogLogProvider()).toBe(provider);
  });

  it("Edge 런타임에서는 만들지 않습니다", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");

    expect((await load())()).toBeNull();
  });

  it("개발 환경에서 설정이 빠지면 바로 실패하고, 프로덕션에서는 조용히 끕니다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    const getPostHogLogProvider = await load();

    vi.stubEnv("NODE_ENV", "development");
    expect(() => getPostHogLogProvider()).toThrow("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN");
    vi.stubEnv("NODE_ENV", "production");
    expect(getPostHogLogProvider()).toBeNull();
  });

  it("운영 로그에 서비스 이름과 배포 환경을 붙입니다", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubEnv("VERCEL_ENV", "production");

    (await load())();

    expect(resourceFromAttributes).toHaveBeenCalledWith({
      "service.name": "finsight",
      "deployment.environment.name": "production",
    });
  });
});
