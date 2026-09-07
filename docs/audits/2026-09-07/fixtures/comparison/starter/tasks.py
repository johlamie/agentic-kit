"""Synthetic starter application. Deliberate benchmark defects, not kit defects."""
import json
from pathlib import Path

class Tasks:
    def __init__(self, path):
        self.path = Path(path)
        self.items = json.loads(self.path.read_text()) if self.path.exists() else []
    def save(self):
        self.path.write_text(json.dumps(self.items))
    def add(self, title):
        item = {'id': max([i['id'] for i in self.items], default=0)+1, 'title': title, 'done': False}
        self.items.append(item)
        self.save()
        return item
    def complete(self, task_id):
        for item in self.items:
            if item['id'] == task_id:
                item['done'] = True
                self.save()
                return item
        raise KeyError(task_id)
    def list(self):
        return list(self.items)
    def stats(self):
        return {'total': len(self.items), 'completed': len(self.items)}
