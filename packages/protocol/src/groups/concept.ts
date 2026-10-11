import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { ServiceUnavailableError } from "../errors"

export const ConceptStatus = Schema.Literals(["unlearned", "learned", "muted", "snoozed"])

export const ConceptGroup = HttpApiGroup.make("server.concept")
  .add(
    HttpApiEndpoint.post("concept.status.set", "/api/concept/:id/status", {
      params: { id: Schema.String },
      payload: Schema.Struct({ status: ConceptStatus }),
      success: HttpApiSchema.NoContent,
      error: ServiceUnavailableError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.concept.status.set",
        summary: "Set concept status",
        description: "Mark a concept-tagger vault concept as learned, muted, snoozed, or unlearned.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "concept",
      description: "Experimental concept-tagger vault routes.",
    }),
  )
