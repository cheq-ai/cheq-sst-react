import type { Config, EventInit } from "./Types";
import { LIBRARY_NAME, LIBRARY_VERSION } from "./Info";
import { getMobileData } from "./platform/mobileData";

const MODELS_VERSION = "0.1.0";
export class Event {
    readonly name: string;
    readonly data: Record<string, unknown>;
    readonly parameters: Record<string, string>;

    constructor(name: string, init: EventInit = {}) {
        this.name = name;
        this.data = Object.freeze(init.data ?? {});
        this.parameters = Object.freeze(init.parameters ?? {});
        Object.freeze(this);
    }
}

type ModelType = "STANDARD" | "DEFAULT" | "REQUIRED";

export abstract class Model {
    abstract key: string;
    version: string = "1.0.0";
    protected modelType: ModelType = "STANDARD";

    abstract get(event: Event, sst: { config: Config; userAgent?: string | null }): Promise<any>;

    getType(): ModelType {
        return this.modelType;
    }
}

/**
 * Marker model: adds "advertising enabled" to models list,
 * so native can collect IDFA/AAID (when permitted).
 *
 * Usage:
 * Models.default().add(new CheqAdvertisingModel())
 */
export class CheqAdvertisingModel extends Model {
    key = "advertising";
    version = "1.0.0";
    protected modelType: ModelType = "STANDARD";

    async get(): Promise<any> {
        // Marker only; returning enabled keeps it explicit in event payload if you collect models.
        return { enabled: true };
    }
}

class LibraryModel extends Model {
    key = "library";
    protected modelType: ModelType = "REQUIRED";

    async get(_event: Event, sst: { config: Config }): Promise<any> {
        return {
            name: LIBRARY_NAME,
            version: LIBRARY_VERSION,
            models: sst.config.models.info()
        };
    }
}

export class Models {
    static version: string = MODELS_VERSION;

    private models: Model[];

    private byKey: Map<string, Model>;
    private byType: Map<ModelType, Model[]>;

    private constructor(models: Model[]) {
        this.models = [];
        this.byKey = new Map<string, Model>();
        this.byType = new Map<ModelType, Model[]>([
            ["STANDARD", []],
            ["DEFAULT", []],
            ["REQUIRED", []]
        ]);

        // Validate initial set too (required/default)
        for (const model of models) {
            this.addInternal(model);
        }
    }

    static required(): Models {
        return new Models([
            new LibraryModel()
        ]);
    }

    static default(): Models {
        return new Models([
            new LibraryModel(),
            new DeviceDataModel()
        ]);
    }

    add(model: Model): Models {
        this.addInternal(model);
        return this;
    }

    private addInternal(model: Model): void {
        const key = (model.key ?? "").trim();

        if (!key) {
            throw new Error("Models.add(): model.key must be a non-empty string");
        }

        const existing = this.byKey.get(key);
        if (existing) {
            throw new Error(
                `Models.add(): duplicate model key "${key}" (existing type=${existing.getType()}, new type=${model.getType()})`
            );
        }

        this.models.push(model);
        this.byKey.set(key, model);

        const type = model.getType();
        const bucket = this.byType.get(type);
        if (!bucket) {
            // Should never happen given ModelType union, but keeps it safe.
            throw new Error(`Models.add(): unknown model type "${String(type)}" for key "${key}"`);
        }
        bucket.push(model);
    }

    hasAdvertising(): boolean {
        return this.models.some((m) => m.key === "advertising");
    }

    async collect(
        event: Event,
        sst: { config: Config; userAgent?: string | null }
    ): Promise<Record<string, any>> {
        const result: Record<string, any> = {
            version: Models.version
        };

        for (const model of this.models) {
            const value = await model.get(event, sst);

            // avoid emitting empty models unless required
            if (model.getType() === "REQUIRED" || (value != null && (typeof value !== "object" || Object.keys(value).length > 0))) {
                if ((model.key === 'library') && value.models && value.models.library) {
                    delete value.models.library;
                }
                result[model.key] = value;
            }
        }
        return result;
    }

    info(filter?: (model: Model) => boolean): Record<string, string> {
        const out: Record<string, string> = {};
        for (const model of this.models) {
            if (!filter || filter(model)) {
                out[model.key] = model.version;
            }
        }
        return out;
    }
}

export class DeviceDataModel extends Model {
    key = "deviceData";
    version = "1.0.0";
    protected modelType: ModelType = "DEFAULT";

    async get(_event: Event, sst: { config: Config }): Promise<any> {
        return await getMobileData(sst.config);
    }
}