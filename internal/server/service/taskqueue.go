package service

import (
	"sync"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// queuedTask is a task waiting to be claimed by a daemon. The installation
// token is empty until claim time, when the server mints a fresh one.
type queuedTask struct {
	task           v1.Task
	installationID int64 // GitHub installation id, used to mint the token at claim
}

// TaskQueue is an in-memory FIFO queue of tasks keyed by target daemon.
// Chapter 9 replaces it with a persisted task table + lifecycle state machine.
type TaskQueue struct {
	mu    sync.Mutex
	tasks map[uuid.UUID][]*queuedTask
}

func NewTaskQueue() *TaskQueue {
	return &TaskQueue{tasks: make(map[uuid.UUID][]*queuedTask)}
}

func (q *TaskQueue) Enqueue(daemonID uuid.UUID, t *queuedTask) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.tasks[daemonID] = append(q.tasks[daemonID], t)
}

func (q *TaskQueue) Dequeue(daemonID uuid.UUID) *queuedTask {
	q.mu.Lock()
	defer q.mu.Unlock()
	queue := q.tasks[daemonID]
	if len(queue) == 0 {
		return nil
	}
	t := queue[0]
	queue = queue[1:]
	if len(queue) == 0 {
		delete(q.tasks, daemonID)
	} else {
		q.tasks[daemonID] = queue
	}
	return t
}

func (q *TaskQueue) HasPending(daemonID uuid.UUID) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.tasks[daemonID]) > 0
}
