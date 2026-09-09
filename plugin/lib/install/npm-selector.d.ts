export type NpmSelector = {
    kind: "version" | "range" | "tag";
    value: string;
};
export declare function parseNpmSelector(value: string): NpmSelector | null;
