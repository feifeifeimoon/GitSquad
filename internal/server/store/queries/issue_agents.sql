-- Who works on an issue, with what each agent is doing on it right now.
--
-- The state is derived per (issue, agent) rather than read off the agent: an
-- agent's own "current task" is its newest one anywhere, while this answers
-- "what is it doing *here*". A task that is dispatched or running wins over one
-- still queued, so a fresh queued task never hides work already in flight.

-- name: ListIssueAgents :many
SELECT a.id, a.name, COALESCE(a.avatar_url, '') AS avatar_url,
       CASE WHEN bool_or(t.status IN ('dispatched','running')) THEN 'running'
            WHEN bool_or(t.status = 'queued')             THEN 'queued'
            ELSE 'idle' END::text AS state
FROM issue_agents ia
JOIN agents a ON a.id = ia.agent_id
LEFT JOIN tasks t ON t.issue_id = ia.issue_id AND t.agent_id = ia.agent_id
WHERE ia.issue_id = $1
GROUP BY a.id, a.name, a.avatar_url, a.created_at
ORDER BY a.created_at;

-- name: ListIssueAgentsByWorkspace :many
-- The board's version: every assignment in the workspace in one read, so the
-- service can group by issue_id instead of running a query per card.
SELECT ia.issue_id, a.id, a.name, COALESCE(a.avatar_url, '') AS avatar_url,
       CASE WHEN bool_or(t.status IN ('dispatched','running')) THEN 'running'
            WHEN bool_or(t.status = 'queued')             THEN 'queued'
            ELSE 'idle' END::text AS state
FROM issue_agents ia
JOIN issues i ON i.id = ia.issue_id
JOIN agents a ON a.id = ia.agent_id
LEFT JOIN tasks t ON t.issue_id = ia.issue_id AND t.agent_id = ia.agent_id
WHERE i.workspace_id = $1
GROUP BY ia.issue_id, a.id, a.name, a.avatar_url, a.created_at
ORDER BY ia.issue_id, a.created_at;

-- name: DeleteIssueAgents :exec
DELETE FROM issue_agents WHERE issue_id = $1;

-- name: AddIssueAgent :exec
-- The pair is the primary key, so a repeat is a no-op: mention-triggered
-- assignment and the picker can both be called twice safely.
INSERT INTO issue_agents (issue_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;
