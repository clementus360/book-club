"use client";

import { useState } from "react";
import { recommendBook, editRecommendation } from "@/lib/actions/books";
import { FormDialog } from "./forms/dialog";
import { Checkbox, TextArea } from "./forms/fields";

type Review = { rating: number | null; review_text: string | null } | null;

function ShareReview({ initial, hint }: { initial: string | null; hint: string }) {
  const [share, setShare] = useState(Boolean(initial));
  const [value, setValue] = useState(initial);
  return (
    <>
      <Checkbox name="share_review" checked={share} onChange={(e) => setShare(e.target.checked)} label="Share some of my thoughts too" hint={hint} />
      {share && <TextArea className="mt-3 mb-5" label="What the club will read" name="shared_review" rows={6} maxLength={20000} value={value ?? ""} onChange={(e) => setValue(e.target.value)} />}
    </>
  );
}

export function RecommendDialog({ bookId, bookTitle, clubs, review, triggerClass = "btn btn-primary" }: {
  bookId: string; bookTitle: string; clubs: { id: string; name: string; done: boolean }[]; review: Review; triggerClass?: string;
}) {
  const open = clubs.filter((c) => !c.done);
  if (!clubs.length) return null;
  if (!open.length) return <p className="meta">You have recommended this to {clubs.length === 1 ? clubs[0]!.name : "all of your clubs"}.</p>;
  return (
    <FormDialog trigger="Recommend to club" triggerClass={triggerClass} title={`Recommend ${bookTitle}`} action={recommendBook} hidden={{ book_id: bookId }} submit="Recommend">
      <fieldset className="mb-5">
        <legend className="label">To which club?</legend>
        {open.map((c) => <label key={c.id} className="choice"><input type="radio" name="club_id" value={c.id} required defaultChecked={open.length === 1} />{c.name}</label>)}
        <p className="hint">Only that club will see it. It does not go into the vote.</p>
      </fieldset>
      <TextArea label="Why they might enjoy it (optional)" name="text" rows={4} maxLength={4000} />
      {review?.rating && <Checkbox name="share_rating" label={`Share my rating (${review.rating} out of 5)`} />}
      <ShareReviewFrom review={review} />
    </FormDialog>
  );
}

function ShareReviewFrom({ review }: { review: Review }) {
  const [share, setShare] = useState(false);
  return (
    <>
      <Checkbox name="share_review" checked={share} onChange={(e) => setShare(e.target.checked)} label={review?.review_text ? "Share my review, or part of it" : "Share a short review"}
        hint="Your private review stays private. The club sees only the copy below, which will not change if you edit your review later." />
      {share && <TextArea className="mt-3 mb-5" label="What the club will read" name="shared_review" rows={6} maxLength={20000} defaultValue={review?.review_text ?? ""} />}
    </>
  );
}

export function EditRecommendation({ rec, currentRating }: {
  rec: { id: string; recommendation_text: string | null; shared_rating: number | null; shared_review_text: string | null }; currentRating: number | null;
}) {
  return (
    <FormDialog trigger="Edit" triggerClass="btn-text" title="Edit your recommendation" action={editRecommendation} hidden={{ id: rec.id }} submit="Save">
      <TextArea label="Why they might enjoy it (optional)" name="text" rows={4} maxLength={4000} defaultValue={rec.recommendation_text ?? ""} />
      {(rec.shared_rating || currentRating) && (
        <fieldset className="mb-5">
          <legend className="label">Rating</legend>
          <label className="choice"><input type="radio" name="rating_mode" value="keep" defaultChecked />{rec.shared_rating ? `Keep the shared rating, ${rec.shared_rating} out of 5` : "Keep it unshared"}</label>
          {currentRating && currentRating !== rec.shared_rating && <label className="choice"><input type="radio" name="rating_mode" value="update" />Share my current rating, {currentRating} out of 5</label>}
          {rec.shared_rating && <label className="choice"><input type="radio" name="rating_mode" value="remove" />Stop sharing a rating</label>}
        </fieldset>
      )}
      <ShareReview initial={rec.shared_review_text} hint="Separate from your private review." />
    </FormDialog>
  );
}
