import React from 'react';

function AuthPanel({
  authMode,
  authForm,
  authError,
  isAuthSubmitting,
  onFieldChange,
  onSubmit
}) {
  if (!authMode) {
    return null;
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <h3>{authMode === 'register' ? 'Создать аккаунт' : 'Войти в аккаунт'}</h3>

      {authMode === 'register' ? (
        <label>
          <span>Имя пользователя</span>
          <input
            name="username"
            type="text"
            value={authForm.username}
            onChange={onFieldChange}
            autoComplete="username"
            required
          />
        </label>
      ) : null}

      <label>
        <span>{authMode === 'register' ? 'Email' : 'Email или логин'}</span>
        <input
          name="email"
          type={authMode === 'register' ? 'email' : 'text'}
          value={authForm.email}
          onChange={onFieldChange}
          autoComplete={authMode === 'register' ? 'email' : 'username'}
          required
        />
      </label>

      <label>
        <span>Пароль</span>
        <input
          name="password"
          type="password"
          value={authForm.password}
          onChange={onFieldChange}
          autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
          required
        />
      </label>

      {authError ? <div className="auth-error">{authError}</div> : null}

      <button type="submit" className="auth-submit-btn" disabled={isAuthSubmitting}>
        {isAuthSubmitting
          ? 'Подождите...'
          : authMode === 'register'
            ? 'Зарегистрироваться'
            : 'Войти'}
      </button>
    </form>
  );
}

export default AuthPanel;
