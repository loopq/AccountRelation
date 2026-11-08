let csrf = null;
export async function request(path,method = 'GET',body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch('/api'+path,{ method,headers,credentials:'same-origin',cache:'no-store',
    ...(body !== undefined ? { body:JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || '请求失败');
    error.status = response.status;
    throw error;
  }
  if ('authenticated' in result) csrf = result.authenticated ? result.csrf : null;
  if (path === '/logout') csrf = null;
  return result;
}
