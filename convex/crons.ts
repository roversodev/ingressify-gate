import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Executa a cada 5 minutos para verificar ativações automáticas
crons.interval(
  "process-ticket-activations",
  { minutes: 5 },
  internal.ticketActivation.processAllEventActivations
)

export default crons