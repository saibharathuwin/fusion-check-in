import { supabase } from '../lib/supabaseClient'

// Staff-facing only (pass filenames) — never shown to students, never printed on the pass card.
// See supabase/schema-student-fusion-ids.sql for why this lives in its own table.

export async function fetchFusionId(studentId: string): Promise<string | null> {
  const { data, error } = await supabase.from('student_fusion_ids').select('fusion_code').eq('student_id', studentId).maybeSingle()
  if (error) throw error
  return data?.fusion_code ?? null
}

// Batch form for the bulk ZIP download — one request for the whole roster instead of one per
// student.
export async function fetchFusionIdsByStudentIds(studentIds: string[]): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map()
  const { data, error } = await supabase.from('student_fusion_ids').select('student_id, fusion_code').in('student_id', studentIds)
  if (error) throw error
  return new Map((data ?? []).map((row) => [row.student_id as string, row.fusion_code as string]))
}
