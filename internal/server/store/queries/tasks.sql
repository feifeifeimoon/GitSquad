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
UPDATE tasks SET status = 'running', started_at = now(), updated_at = now() WHERE id = $1 RETURNING *;

-- name: MarkTaskCompleted :one
UPDATE tasks SET status = 'completed', result = $2, completed_at = now(), updated_at = now() WHERE id = $1 RETURNING *;

-- name: MarkTaskFailed :one
UPDATE tasks SET status = 'failed', error = $2, failure_reason = $3, completed_at = now(), updated_at = now() WHERE id = $1 RETURNING *;

-- name: HasPendingForDaemon :one
SELECT EXISTS(SELECT 1 FROM tasks WHERE assigned_daemon_id = $1 AND status = 'queued') AS has_pending;

-- name: FailDaemonTasks :many
UPDATE tasks
SET status = 'failed', failure_reason = 'runtime_offline', completed_at = now(), updated_at = now()
WHERE assigned_daemon_id = $1 AND status IN ('dispatched','running')
RETURNING *;

-- name: InsertTaskMessage :one
INSERT INTO task_messages (task_id, seq, type, tool, content, input, output)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: ListTaskMessages :many
SELECT * FROM task_messages WHERE task_id = $1 AND seq > $2 ORDER BY seq ASC;

-- name: NextTaskMessageSeq :one
SELECT COALESCE(MAX(seq), 0)::int AS seq FROM task_messages WHERE task_id = $1;
