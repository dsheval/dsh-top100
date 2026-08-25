/**
 * dsh-Top100 host half.
 * Official plugin shape: export name + apply(ctx, config) + Config schema.
 */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
export declare const name = "dsh-top100";
export interface Config {
    dataUrl: string;
    profile: string;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config?: Config): void;
