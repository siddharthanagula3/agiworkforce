import { supabase } from '@shared/lib/supabase-client';
import { AI_EMPLOYEES, type AIEmployee } from '@/data/marketplace-employees';

export interface PurchasedEmployeeRecord {
  id: string;
  user_id: string;
  employee_id: string;
  employee_name: string | null;
  hired_at: string | null;
}

function getUserIdOrThrow(userId?: string | null): string {
  if (!userId) throw new Error('User not authenticated');
  return userId;
}

export async function listPurchasedEmployees(
  userId?: string | null,
): Promise<PurchasedEmployeeRecord[]> {
  const uid = getUserIdOrThrow(userId);

  try {
    const { data, error } = await supabase
      .from('hired_employees')
      .select('*')
      .eq('user_id', uid)
      .order('hired_at', { ascending: false });

    if (error) {
      console.error('[listPurchasedEmployees] Error:', error);

      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return [];
      }

      throw error;
    }

    return (data || []) as PurchasedEmployeeRecord[];
  } catch (err) {
    console.error('[listPurchasedEmployees] Error:', err);

    if (err instanceof Error && err.message?.includes('does not exist')) {
      return [];
    }

    throw err;
  }
}

export async function isEmployeePurchased(
  userId: string | null | undefined,
  employeeId: string,
): Promise<boolean> {
  const uid = getUserIdOrThrow(userId);

  try {
    const { data, error } = await supabase
      .from('hired_employees')
      .select('id')
      .eq('user_id', uid)
      .eq('employee_id', employeeId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return false;
      }
      throw error;
    }

    return !!data;
  } catch (err) {
    if (err instanceof Error && err.message?.includes('does not exist')) {
      return false;
    }

    throw err;
  }
}

export async function purchaseEmployee(
  userId?: string | null,
  employee?: AIEmployee,
): Promise<PurchasedEmployeeRecord> {
  const uid = getUserIdOrThrow(userId);
  if (!employee) throw new Error('Employee not provided');

  try {
    const { data, error } = await supabase
      .from('hired_employees')
      .upsert(
        {
          user_id: uid,
          employee_id: employee.id,
          employee_name: employee.name,
        },
        { onConflict: 'user_id,employee_id' },
      )
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[purchaseEmployee] Error:', error);

      if (error.message?.includes('does not exist') || error.code === '42P01') {
        throw new Error(
          'DATABASE_SETUP_REQUIRED: The hired_employees table needs to be created. Please run the database setup script in Supabase.',
        );
      }

      throw error;
    }

    return data as unknown as PurchasedEmployeeRecord;
  } catch (err) {
    console.error('[purchaseEmployee] Error:', err);
    throw err;
  }
}

export function getEmployeeById(employeeId: string): AIEmployee | undefined {
  return AI_EMPLOYEES.find((e) => e.id === employeeId);
}
