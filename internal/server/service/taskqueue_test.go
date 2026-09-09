package service

import (
	"testing"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

func TestTaskQueue(t *testing.T) {
	q := NewTaskQueue()
	daemon := uuid.New()

	if q.HasPending(daemon) {
		t.Fatal("empty queue should have no pending")
	}
	if q.Dequeue(daemon) != nil {
		t.Fatal("empty queue should dequeue nil")
	}

	t1 := &queuedTask{task: v1.Task{ID: uuid.New()}}
	t2 := &queuedTask{task: v1.Task{ID: uuid.New()}}
	q.Enqueue(daemon, t1)
	q.Enqueue(daemon, t2)

	if !q.HasPending(daemon) {
		t.Fatal("queue should have pending after enqueue")
	}
	if got := q.Dequeue(daemon); got != t1 {
		t.Fatal("dequeue should return first enqueued (FIFO)")
	}
	if got := q.Dequeue(daemon); got != t2 {
		t.Fatal("dequeue should return second enqueued")
	}
	if q.HasPending(daemon) {
		t.Fatal("queue should be empty after draining")
	}
	if q.Dequeue(daemon) != nil {
		t.Fatal("queue should dequeue nil after draining")
	}
}
