import {
  getSupabaseBrowserClient,
  getSupabaseSessionSafely
} from "@/lib/supabase";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";


async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return {};
  }

  const session = await getSupabaseSessionSafely(supabase);
  const token = session?.access_token;

  return token ? { Authorization: `Bearer ${token}` } : {};
}


export type DocumentUploadResponse = {
  document_id: string;
  filename: string;
  file_type: string;
  status: string;
  storage_path: string;
  metadata_stored: boolean;
  chunks_stored: number;
};


export type DocumentListItem = {
  document_id: string;
  filename: string;
  file_type: string;
  status: string;
  storage_path: string;
  chunks_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};


export type DocumentDeleteResponse = {
  document_id: string;
  filename: string;
  deleted: boolean;
  detail: string;
};


export type ChatRequest = {
  conversation_id: string | null;
  question: string;
  language?: string;
};


export type ChatCitation = {
  document_id: string;
  chunk_index: number;
  chunk_id: string;
  filename: string;
  page_number: number | null;
  snippet: string;
  score: number | null;
};


export type ChatResponse = {
  conversation_id: string;
  message_id: string;
  answer: string;
  citations: ChatCitation[];
};


export type FeedbackRating = "up" | "down";


export type FeedbackDraft = {
  message_id: string;
  rating: FeedbackRating;
  correction_text: string | null;
};


export type FeedbackResponse = {
  feedback_id: string;
  message_id: string;
  user_id: string | null;
  rating: FeedbackRating;
  correction_text: string | null;
  created_at: string;
};


export type AccountProfile = {
  user_id: string | null;
  organization_id: string;
  organization_name: string | null;
  auth_user_id: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  role: string | null;
  language_preference?: string;
};


export type AccountProfileUpdate = {
  name: string | null;
  job_title: string | null;
  language_preference?: string;
};


export type TeamMember = {
  user_id: string;
  email: string;
  name: string | null;
  job_title: string | null;
  role: "owner" | "member";
};


export type TeamInfo = {
  organization_id: string;
  organization_name: string;
  members: TeamMember[];
};


export type OrganizationInvitation = {
  invitation_id: string;
  organization_id: string;
  organization_name: string;
  invited_email: string;
  invited_by_user_id: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
};


export type TranscriptionResponse = {
  transcript: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};


export type ConversationMessage = {
  id: string;
  role: string;
  content: string;
  citations: ChatCitation[];
  created_at: string;
};


export type ConversationDetail = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ConversationMessage[];
};


export type ConversationListResponse = {
  conversations: ConversationSummary[];
};


export type ConversationDetailResponse = {
  conversation: ConversationDetail;
};



export async function transcribeAudio(audioBlob: Blob, language: string = "en"): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/transcribe?language=${language}`, {
    method: "POST",
    headers: authHeaders,
    body: formData
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Transcription failed. Try again.";

    throw new Error(message);
  }

  return response.json() as Promise<TranscriptionResponse>;
}


export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Chat request failed. Try again.";

    throw new Error(message);
  }

  return response.json() as Promise<ChatResponse>;
}


export async function getAccountProfile(): Promise<AccountProfile> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/users/me`, {
    method: "GET",
    headers: authHeaders,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not load account profile.";

    throw new Error(message);
  }

  return response.json() as Promise<AccountProfile>;
}


export async function updateAccountProfile(
  request: AccountProfileUpdate
): Promise<AccountProfile> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/users/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not update account profile.";

    throw new Error(message);
  }

  return response.json() as Promise<AccountProfile>;
}


export async function getTeamInfo(): Promise<TeamInfo> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/users/team`, {
    method: "GET",
    headers: authHeaders,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not load team settings.";

    throw new Error(message);
  }

  return response.json() as Promise<TeamInfo>;
}


export async function updateOrganizationName(name: string): Promise<TeamInfo> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/users/organization`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not update organization.";

    throw new Error(message);
  }

  return response.json() as Promise<TeamInfo>;
}


export async function updateTeamMemberRole(
  userId: string,
  role: TeamMember["role"]
): Promise<TeamMember> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/users/team/${userId}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify({ role })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not update team member role.";

    throw new Error(message);
  }

  return response.json() as Promise<TeamMember>;
}


export async function createOrganizationInvitation(
  email: string
): Promise<OrganizationInvitation> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/users/invitations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not create invitation.";

    throw new Error(message);
  }

  return response.json() as Promise<OrganizationInvitation>;
}


export async function listOrganizationInvitations(): Promise<
  OrganizationInvitation[]
> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/users/invitations`, {
    method: "GET",
    headers: authHeaders,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not load invitations.";

    throw new Error(message);
  }

  return response.json() as Promise<OrganizationInvitation[]>;
}


export async function acceptOrganizationInvitation(
  invitationId: string
): Promise<AccountProfile> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}/users/invitations/${invitationId}/accept`,
    {
      method: "POST",
      headers: authHeaders
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not accept invitation.";

    throw new Error(message);
  }

  return response.json() as Promise<AccountProfile>;
}


export async function removeTeamMember(userId: string): Promise<TeamMember> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/users/team/${userId}`, {
    method: "DELETE",
    headers: authHeaders
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not remove team member.";

    throw new Error(message);
  }

  return response.json() as Promise<TeamMember>;
}


export async function submitFeedback(request: FeedbackDraft): Promise<FeedbackResponse> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Feedback could not be submitted.";

    throw new Error(message);
  }

  return response.json() as Promise<FeedbackResponse>;
}


export async function listDocuments(): Promise<DocumentListItem[]> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "GET",
    headers: authHeaders,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not load documents.";

    throw new Error(message);
  }

  return response.json() as Promise<DocumentListItem[]>;
}


export async function uploadDocument(file: File): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: "POST",
    headers: authHeaders,
    body: formData
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Document upload failed. Try again.";

    throw new Error(message);
  }

  return response.json() as Promise<DocumentUploadResponse>;
}


export async function deleteDocument(documentId: string): Promise<DocumentDeleteResponse> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
    method: "DELETE",
    headers: authHeaders
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Document could not be deleted.";

    throw new Error(message);
  }

  return response.json() as Promise<DocumentDeleteResponse>;
}


export async function listConversations(): Promise<ConversationListResponse> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: "GET",
    headers: authHeaders,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not load conversations.";

    throw new Error(message);
  }

  return response.json() as Promise<ConversationListResponse>;
}


export async function getConversation(
  conversationId: string
): Promise<ConversationDetailResponse> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
    method: "GET",
    headers: authHeaders,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not load conversation.";

    throw new Error(message);
  }

  return response.json() as Promise<ConversationDetailResponse>;
}


export async function deleteConversation(conversationId: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
    method: "DELETE",
    headers: authHeaders
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not delete conversation.";

    throw new Error(message);
  }
}


export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}/conversations/${conversationId}/title`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders
      },
      body: JSON.stringify({ title })
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Could not update conversation title.";

    throw new Error(message);
  }
}
