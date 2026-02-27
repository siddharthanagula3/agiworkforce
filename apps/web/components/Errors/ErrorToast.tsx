// Stub for desktop ErrorToast
export function useErrorToast() {
  return {
    showError: (_code: string, _title: string, _message: string) => {},
    clearError: (_code: string) => {},
  };
}

export default useErrorToast;
