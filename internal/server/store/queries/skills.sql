-- name: CreateSkill :one
INSERT INTO skills (workspace_id, name, description, content, created_by)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: ListSkillsByWorkspace :many
SELECT * FROM skills WHERE workspace_id = $1 ORDER BY name;

-- name: GetSkill :one
SELECT * FROM skills WHERE id = $1 AND workspace_id = $2;

-- name: UpdateSkill :one
UPDATE skills SET name = $3, description = $4, content = $5, updated_at = now()
WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: DeleteSkill :exec
DELETE FROM skills WHERE id = $1 AND workspace_id = $2;

-- name: ListSkillsForAgent :many
SELECT s.* FROM skills s
JOIN agent_skills ag ON ag.skill_id = s.id
WHERE ag.agent_id = $1 ORDER BY s.name;

-- name: DeleteAgentSkills :exec
DELETE FROM agent_skills WHERE agent_id = $1;

-- name: InsertAgentSkill :exec
INSERT INTO agent_skills (agent_id, skill_id) VALUES ($1, $2);
