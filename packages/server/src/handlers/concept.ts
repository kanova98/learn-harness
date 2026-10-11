import { ConceptVault } from "@opencode-ai/core/concept-vault"
import { ServiceUnavailableError } from "@opencode-ai/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"

export const ConceptHandler = HttpApiBuilder.group(Api, "server.concept", (handlers) =>
  Effect.gen(function* () {
    return handlers.handle(
      "concept.status.set",
      Effect.fn(function* (ctx) {
        const vault = yield* ConceptVault.Service
        yield* vault.setStatus({ id: ctx.params.id, status: ctx.payload.status }).pipe(
          Effect.catchTag(
            "ConceptVault.NotConfiguredError",
            (error) => new ServiceUnavailableError({ message: error.message, service: "concept-vault" }),
          ),
          Effect.catchCause(
            () => new ServiceUnavailableError({ message: "Failed to update concept vault", service: "concept-vault" }),
          ),
        )
        return HttpApiSchema.NoContent.make()
      }),
    )
  }),
)
