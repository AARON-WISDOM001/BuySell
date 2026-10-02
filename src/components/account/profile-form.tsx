'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { updateProfile } from '@/app/actions/profile';
import { initialProfileState } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/layout';

/**
 * Edit the display name.
 *
 * The form carries the name and nothing else. It cannot change the email or the
 * account id, and the server ignores any such field even if one is added —
 * ownership comes from the session, never from the form.
 */
export function ProfileForm({ currentName }: { currentName: string }) {
  const [editing, setEditing] = useState(false);
  // Bumped when the form opens, which remounts the fields and resets
  // useActionState. Without it, a previous error or success would still be on
  // screen when the user comes back to edit again.
  const [openKey, setOpenKey] = useState(0);

  if (!editing) {
    return (
      <div className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => {
            setOpenKey((key) => key + 1);
            setEditing(true);
          }}
        >
          Edit name
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <ProfileFormFields
        key={openKey}
        currentName={currentName}
        onDone={() => setEditing(false)}
      />
    </div>
  );
}

function ProfileFormFields({
  currentName,
  onDone,
}: {
  currentName: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, initialProfileState);
  const summaryRef = useRef<HTMLDivElement>(null);
  const saved = state.status === 'success';

  // Take focus to the error summary so a keyboard or screen-reader user lands on
  // the problem rather than being left at the submit button.
  useEffect(() => {
    if (state.status === 'error' && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="max-w-sm">
      {saved ? (
        <div className="mb-4">
          <Notice tone="success">
            Name updated.{' '}
            <button
              type="button"
              onClick={onDone}
              className="font-medium underline underline-offset-2"
            >
              Done
            </button>
          </Notice>
        </div>
      ) : state.status === 'error' ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="mb-4 focus:outline-none">
          <Notice tone="danger" title="Could not save">
            {state.errors && state.errors.length > 0 ? (
              <ul className="list-inside list-disc">
                {state.errors.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`}>
                    <a href={`#field-${issue.field}`} className="underline underline-offset-2">
                      {issue.message}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{state.message}</p>
            )}
          </Notice>
        </div>
      ) : null}

      <Field
        label="Display name"
        name="fullName"
        required
        defaultValue={currentName}
        maxLength={120}
        autoComplete="name"
        error={state.fieldErrors?.fullName}
        hint="Shown on your orders and in your account."
      />

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save name'}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
