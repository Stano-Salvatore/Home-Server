"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskRow } from "@/components/tasks/task-row";

type Task = {
  id: string;
  name: string;
  prompt: string;
  backend: string;
  modelId: string;
  triggerType: string;
  cronExpression: string | null;
  watchPath: string | null;
  watchGlob: string | null;
  runAt: number | null;
  enabled: boolean;
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);

  function fetchTasks() {
    return fetch("/api/tasks")
      .then((r) => r.json())
      .then((data) => data.tasks ?? []);
  }

  useEffect(() => {
    fetchTasks().then(setTasks);
  }, []);

  async function refresh() {
    setTasks(await fetchTasks());
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100 mb-1">Tasks</h1>
          <p className="text-sm text-neutral-500">
            Agent automation: run a prompt against a model manually, on a schedule, or when a file
            changes.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New task"}
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 mb-6">
          <TaskForm
            onCreated={() => {
              setShowForm(false);
              refresh();
            }}
          />
        </Card>
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">No tasks yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
