/**
 * TypeScript types for backend API responses.
 */

export interface User {
  id: string;
  email: string;
  display_name?: string;
  photo_url?: string;
  preferences?: {
    defaultCalendarId?: string;
    timezone?: string;
    autoAddEvents?: boolean;
    conflictBehavior?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  input_type: 'text' | 'image' | 'audio' | 'email';
  input_content: string;
  status: 'pending' | 'processing' | 'processed' | 'error';
  title?: string;
  extracted_events?: any[];
  processed_events?: any[];
  conflicts?: any[];
  event_ids?: string[];
  added_to_calendar: boolean;
  calendar_event_ids?: string[];
  error_message?: string;
  guest_mode?: boolean;
  access_token?: string; // Secure token for guest session access
  created_at: string;
  updated_at: string;
}

export interface CreateSessionRequest {
  input_type: 'text' | 'image' | 'audio';
  input_content: string;
}

export interface CreateSessionResponse {
  session: Session;
  message: string;
}

export interface GetSessionResponse {
  session: Session;
}

export interface GetSessionsResponse {
  sessions: Session[];
  count: number;
}

export interface UploadFileResponse {
  session: Session;
  file_url: string;
  message: string;
}

export interface ApiError {
  error: string;
  details?: string;
}
