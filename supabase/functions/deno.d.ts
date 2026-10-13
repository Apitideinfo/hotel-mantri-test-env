// Type declarations for Supabase Edge Functions (Deno runtime)
// Provides IDE language server support without affecting Deno deployment.

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

declare module "npm:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}
