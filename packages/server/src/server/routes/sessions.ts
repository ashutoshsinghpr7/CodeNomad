import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import { execSync } from "child_process"
import { existsSync, mkdirSync, accessSync, constants } from "fs"
import path from "path"
import os from "os"
import type { Logger } from "../../logger"

interface RouteDeps {
  logger: Logger
}

const MoveSessionSchema = z.object({
  targetPath: z.string().trim().min(1, "Target path is required"),
})

const OPFINE_DB_PATH = path.join(os.homedir(), ".local", "share", "opencode", "opencode.db")

function sqliteExec(query: string): string {
  try {
    return execSync(`sqlite3 "${OPFINE_DB_PATH}" '${query}'`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }).trim()
  } catch {
    throw new Error("Failed to execute database query")
  }
}

function sqliteQuery(query: string): string | null {
  const result = sqliteExec(query)
  return result || null
}

function getSessionProject(
  sessionId: string,
): { project_id: string; directory: string; title: string } | null {
  const row = sqliteQuery(
    `SELECT project_id, directory, title FROM session WHERE id = '${sessionId.replace(/'/g, "''")}'`
  )
  if (!row) return null
  const parts = row.split("|")
  if (parts.length < 3) return null
  return { project_id: parts[0]!, directory: parts[1]!, title: parts[2]! }
}

function findProjectByDirectory(directory: string): string | null {
  return sqliteQuery(
    `SELECT project_id FROM project_directory WHERE directory = '${directory.replace(/'/g, "''")}'`
  )
}

function createProject(directory: string, name: string): string {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const now = Date.now()
  sqliteExec(
    `INSERT INTO project (id, worktree, vcs, name, icon_url, icon_url_override, icon_color, time_created, time_updated, sandboxes, commands) VALUES ('${id}', '${name}', NULL, '${name}', NULL, NULL, NULL, ${now}, ${now}, '[]', NULL)`
  )
  sqliteExec(
    `INSERT INTO project_directory (project_id, directory, type, strategy, time_created) VALUES ('${id}', '${directory.replace(/'/g, "''")}', NULL, NULL, ${now})`
  )
  return id
}

function moveSession(sessionId: string, targetPath: string): void {
  const resolvedPath = path.resolve(targetPath)
  
  if (!existsSync(resolvedPath)) {
    throw new Error(`Target directory does not exist: ${resolvedPath}`)
  }

  let projectId = findProjectByDirectory(resolvedPath)
  if (!projectId) {
    const folderName = path.basename(resolvedPath)
    projectId = createProject(resolvedPath, folderName)
  }

  sqliteExec(
    `UPDATE session SET directory = '${resolvedPath.replace(/'/g, "''")}', project_id = '${projectId}' WHERE id = '${sessionId.replace(/'/g, "''")}'`
  )
}

export function registerSessionRoutes(app: FastifyInstance, deps: RouteDeps) {
  app.post(
    "/api/sessions/:sessionId/move",
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const sessionId = request.params.sessionId
        const body = MoveSessionSchema.parse(request.body ?? {})

        const session = getSessionProject(sessionId)
        if (!session) {
          reply.code(404).send({ error: "Session not found" })
          return
        }

        const resolvedPath = path.resolve(body.targetPath)
        moveSession(sessionId, resolvedPath)

        deps.logger.info(
          { sessionId, from: session.directory, to: resolvedPath },
          "Session moved to new directory"
        )

        reply.send({
          success: true,
          sessionId,
          previousPath: session.directory,
          newPath: resolvedPath,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to move session"
        deps.logger.error({ err: error, sessionId: request.params.sessionId }, "Failed to move session")
        reply.code(400).send({ error: message })
      }
    }
  )
}
