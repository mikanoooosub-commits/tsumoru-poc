'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

// 合言葉の入力欄(WO-024)。照合はサーバーの login(Server Action)だけで行う
export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  return (
    <form action={action} className="login-form">
      <div className="fld">
        <label className="lbl" htmlFor="password">合言葉</label>
        <input
          id="password"
          name="password"
          type="password"
          className="inp"
          autoComplete="current-password"
          required
          aria-invalid={state ? true : undefined}
          aria-describedby={state ? 'login-msg' : undefined}
        />
      </div>
      {state && (
        <p id="login-msg" className="msg ng" role="alert">
          <span aria-hidden="true">!</span>
          <span>{state.message}</span>
        </p>
      )}
      <button type="submit" className="btn primary block" disabled={pending}>
        {pending ? '確かめています…' : 'ログイン'}
      </button>
    </form>
  );
}
