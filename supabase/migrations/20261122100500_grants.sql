-- Commonplace 6/6: explicit privileges. RLS decides which rows; these grants
-- decide which verbs and columns exist at all. Nothing is left to defaults.

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- Reads --------------------------------------------------------------------
grant select on public.profiles, public.clubs, public.club_memberships, public.activity_events,
  public.notifications, public.books, public.user_books, public.personal_reviews, public.club_books,
  public.club_recommendations, public.reading_cycles, public.nominations, public.votes,
  public.vote_rankings, public.vote_rounds, public.vote_results, public.reading_progress,
  public.meetings, public.meeting_attendees, public.discussion_questions, public.discussion_notes,
  public.book_reviews to authenticated;
-- The token hash is not readable by anyone through the API.
grant select (id, club_id, invited_by, status, expires_at, accepted_by, accepted_at, revoked_at, created_at)
  on public.invitations to authenticated;

-- Writes that RLS alone can govern. Everything else goes through functions. --
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (name, description, image_url, timezone, default_nomination_days, default_voting_days,
  default_reading_days, default_runoff_days) on public.clubs to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant insert (user_id, book_id, status, date_started, date_finished, is_favourite, private_notes),
  update (status, date_started, date_finished, is_favourite, private_notes), delete
  on public.user_books to authenticated;
-- The next three include their key columns in UPDATE because PostgREST's upsert
-- sets every column it was sent. RLS still pins user_id to the caller.
grant insert (user_id, book_id, rating, review_text), update (user_id, book_id, rating, review_text), delete
  on public.personal_reviews to authenticated;

grant insert (cycle_id, user_id, status, current_page, percentage),
  update (cycle_id, user_id, status, current_page, percentage) on public.reading_progress to authenticated;

grant insert (club_id, cycle_id, title, description, starts_at, timezone, location, agenda, discussion_leader_id),
  update (cycle_id, title, description, starts_at, timezone, location, agenda, discussion_leader_id, status)
  on public.meetings to authenticated;
grant insert (meeting_id, user_id, attendance_status), update (meeting_id, user_id, attendance_status)
  on public.meeting_attendees to authenticated;

grant insert (club_id, cycle_id, question), update (question), delete on public.discussion_questions to authenticated;
grant insert (club_id, cycle_id, meeting_id, kind, content, source), update (content, source), delete
  on public.discussion_notes to authenticated;
grant delete on public.book_reviews to authenticated;

-- Functions -----------------------------------------------------------------
grant execute on function
  public.create_club(text, text, text), public.create_invitation(uuid), public.revoke_invitation(uuid),
  public.accept_invitation(text), public.set_member_role(uuid, uuid, public.club_role),
  public.remove_member(uuid, uuid), public.leave_club(uuid), public.close_club(uuid),
  public.create_manual_book(jsonb), public.update_manual_book(uuid, jsonb), public.can_edit_book(uuid),
  public.find_similar_books(jsonb), public.consume_search_quota(),
  public.add_club_book(uuid, uuid), public.remove_club_book(uuid, uuid),
  public.recommend_book(uuid, uuid, text, boolean, text),
  public.edit_recommendation(uuid, text, text, text), public.withdraw_recommendation(uuid),
  public.sync_club(uuid),
  public.create_cycle(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz),
  public.update_cycle_schedule(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz),
  public.open_voting_now(uuid), public.close_voting_now(uuid),
  public.reopen_nominations(uuid, timestamptz, timestamptz), public.reopen_voting(uuid, timestamptz),
  public.confirm_sole_nomination(uuid), public.decide_selection(uuid, uuid, text),
  public.cancel_cycle(uuid), public.complete_cycle(uuid), public.reopen_cycle(uuid),
  public.nominate(uuid, uuid, text), public.update_nomination(uuid, uuid, text), public.withdraw_nomination(uuid),
  public.submit_ballot(uuid, uuid[]), public.ballot_count(uuid),
  public.record_meeting_outcomes(uuid, text, boolean), public.save_club_review(uuid, smallint, text)
  to authenticated;

-- The only call a signed-out visitor can make.
grant execute on function public.preview_invitation(text) to anon, authenticated;

-- The only call that needs the service role: importing provider metadata the
-- server fetched itself.
grant execute on function public.import_book(jsonb, boolean) to service_role;

-- Helpers that policies and SECURITY INVOKER code evaluate as the caller.
grant execute on function
  private.is_member(uuid), private.is_admin(uuid), private.can_see_profile(uuid),
  private.manual_book_visible(uuid), private.norm(text),
  private.is_cycle_member(uuid), private.can_update_progress(uuid),
  private.can_attend(uuid), private.is_meeting_member(uuid),
  private.fail(text), private.assert_timezone(text),
  private.touch_updated_at(), private.check_timezone()
  to authenticated;

-- Future tables start closed. Postgres still grants EXECUTE on new functions to
-- PUBLIC by default, so every later migration that adds one must revoke it.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
