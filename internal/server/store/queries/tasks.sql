-- name: CreateTask :one
INSERT INTO tasks (workspace_id, issue_id, agent_id, assigned_daemon_id, provider, model, context)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: GetTask :one
SELECT * FROM tasks WHERE id = $1;

-- name: ClaimNextTask :one
UPDATE tasks
SET status = 'dispatched', dispatched_at = now(), updated_at = now()
WHERE tasks.id = (
    SELECT t.id FROM tasks t
    WHERE t.assigned_daemon_id = $1 AND t.status = 'queued'
    ORDER BY t.priority DESC, t.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING *;

-- name: MarkTaskRunning :one
UPDATE tasks SET status = 'running', started_at = now(), updated_at = now()
WHERE id = $1 AND status = 'dispatched' RETURNING *;

-- name: MarkTaskCompleted :one
UPDATE tasks SET status = 'completed', completed_at = now(), updated_at = now()
WHERE id = $1 AND status IN ('dispatched','running') RETURNING *;

-- name: SetTaskResult :exec
UPDATE tasks SET result = $2, updated_at = now() WHERE id = $1;

-- name: MarkTaskFailed :one
UPDATE tasks SET status = 'failed', error = $2, failure_reason = $3, completed_at = now(), updated_at = now()
WHERE id = $1 AND status IN ('dispatched','running') RETURNING *;

-- name: RevertTaskToQueued :one
UPDATE tasks SET status = 'queued', dispatched_at = NULL, updated_at = now()
WHERE id = $1 AND status = 'dispatched' RETURNING *;

-- name: HasPendingForDaemon :one
SELECT EXISTS(SELECT 1 FROM tasks WHERE assigned_daemon_id = $1 AND status = 'queued') AS has_pending;

-- name: FailTasksOfSilentDaemons :many
-- Fails the in-flight tasks of every daemon that has stopped heartbeating for at
-- least @grace_seconds, returning them so the caller can tell their issues.
--
-- Why the delay is measured from the heartbeat and not from the socket: a socket
-- ending says nothing about whether its daemon can still finish and report the
-- task. A NAT rebind, a suspended laptop or a server-side read deadline all end
-- the socket while the daemon keeps working, and task results travel over HTTP,
-- not the WebSocket. The only honest evidence of absence is the signal the
-- daemon repeats on its own schedule — so a task lives exactly as long as its
-- daemon keeps checking in, and this grace is that same clock.
--
-- COALESCE mirrors the staleness rule used elsewhere: a daemon that never
-- connected has no last_seen_at, so its registration time stands in.
UPDATE tasks
SET status = 'failed', failure_reason = 'runtime_offline', completed_at = now(), updated_at = now()
WHERE status IN ('dispatched','running')
  AND assigned_daemon_id IS NOT NULL
  AND assigned_daemon_id IN (
      SELECT id FROM daemons
      WHERE COALESCE(last_seen_at, registered_at) < now() - make_interval(secs => @grace_seconds::double precision)
  )
RETURNING *;

-- name: InsertTaskMessage :one
INSERT INTO task_messages (task_id, seq, type, tool, content, input, output)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: ListTaskMessages :many
SELECT * FROM task_messages WHERE task_id = $1 AND seq > $2 ORDER BY seq ASC;

-- name: NextTaskMessageSeq :one
SELECT COALESCE(MAX(seq), 0)::int AS seq FROM task_messages WHERE task_id = $1;
