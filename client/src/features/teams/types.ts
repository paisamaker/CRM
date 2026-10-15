export interface TeamMember {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  department?: string;
  designation?: string;
}

export interface TeamProject {
  _id: string;
  name: string;
  status: 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  progress: number;
  budget?: number;
  client?: { name?: string };
}

export interface WorkingTeam {
  _id: string;
  name: string;
  description?: string;
  lead?: TeamMember;
  members: TeamMember[];
  project?: TeamProject;
  department?: string;
  status: 'active' | 'archived';
  taskStats?: {
    total: number;
    completed: number;
  };
  createdAt: string;
  updatedAt: string;
}
