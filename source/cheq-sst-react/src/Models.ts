import type { Config, EventInit } from "./Types";
import { LIBRARY_NAME, LIBRARY_VERSION } from "./Info";

const MODEL_VERSION = "1.0.0";
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

    version: string = MODEL_VERSION;

    protected modelType: ModelType = "STANDARD";

    async get(_event: Event, _sst: { config: Config; userAgent?: string | null }): Promise<any> {
        throw new Error("Model.get must be overridden");
    }

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
    private models: Model[];

    private constructor(models: Model[]) {
        this.models = models;
    }

    static required(): Models {
        return new Models([
            new LibraryModel()
        ]);
    }

    static default(): Models {
        return new Models([
            new LibraryModel()
        ]);
    }

    add(model: Model): Models {
        this.models.push(model);
        return this;
    }

    hasAdvertising(): boolean {
        return this.models.some((m) => m.key === "advertising");
    }

    async collect(
        event: Event,
        sst: { config: Config; userAgent?: string | null }
    ): Promise<Record<string, any>> {
        const result: Record<string, any> = {};

        for (const model of this.models) {
            result[model.key] = await model.get(event, sst);
        }

        return result;
    }

    info(): Record<string, string> {
        const out: Record<string, string> = {};

        for (const model of this.models) {
            out[model.key] = model.version;
        }

        return out;
    }
}