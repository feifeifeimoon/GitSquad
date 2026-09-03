package service

import (
	"context"
	"fmt"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

type SkillService struct{ store *store.Store }

func NewSkillService(s *store.Store) *SkillService { return &SkillService{store: s} }

func (s *SkillService) CreateSkill(ctx context.Context, workspaceID, userID uuid.UUID, req v1.CreateSkillRequest) (*v1.Skill, error) {
	if req.Name == "" {
		return nil, ErrSkillNotFound
	}
	sk, err := s.store.CreateSkill(ctx, db.CreateSkillParams{
		WorkspaceID: workspaceID,
		Name:        req.Name,
		Description: req.Description,
		Content:     req.Content,
		CreatedBy:   &userID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrSkillNameTaken
		}
		return nil, fmt.Errorf("create skill: %w", err)
	}
	return toSkill(sk), nil
}

func (s *SkillService) ListSkills(ctx context.Context, workspaceID uuid.UUID) ([]v1.Skill, error) {
	rows, err := s.store.ListSkillsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	return toSkills(rows), nil
}

func (s *SkillService) GetSkill(ctx context.Context, workspaceID, skillID uuid.UUID) (*v1.Skill, error) {
	sk, err := s.store.GetSkill(ctx, db.GetSkillParams{ID: skillID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, ErrSkillNotFound
	}
	return toSkill(sk), nil
}

func (s *SkillService) UpdateSkill(ctx context.Context, workspaceID, skillID uuid.UUID, req v1.UpdateSkillRequest) (*v1.Skill, error) {
	cur, err := s.store.GetSkill(ctx, db.GetSkillParams{ID: skillID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, ErrSkillNotFound
	}
	params := db.UpdateSkillParams{
		ID:          skillID,
		WorkspaceID: workspaceID,
		Name:        cur.Name,
		Description: cur.Description,
		Content:     cur.Content,
	}
	if req.Name != nil {
		params.Name = *req.Name
	}
	if req.Description != nil {
		params.Description = *req.Description
	}
	if req.Content != nil {
		params.Content = *req.Content
	}
	sk, err := s.store.UpdateSkill(ctx, params)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrSkillNameTaken
		}
		return nil, fmt.Errorf("update skill: %w", err)
	}
	return toSkill(sk), nil
}

func (s *SkillService) DeleteSkill(ctx context.Context, workspaceID, skillID uuid.UUID) error {
	return s.store.DeleteSkill(ctx, db.DeleteSkillParams{ID: skillID, WorkspaceID: workspaceID})
}

func toSkill(sk db.Skill) *v1.Skill {
	return &v1.Skill{
		ID:          sk.ID,
		WorkspaceID: sk.WorkspaceID,
		Name:        sk.Name,
		Description: sk.Description,
		Content:     sk.Content,
		CreatedAt:   sk.CreatedAt,
		UpdatedAt:   sk.UpdatedAt,
	}
}

func toSkills(rows []db.Skill) []v1.Skill {
	out := make([]v1.Skill, 0, len(rows))
	for _, r := range rows {
		out = append(out, *toSkill(r))
	}
	return out
}
