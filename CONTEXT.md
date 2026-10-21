# Utsavvy

A GenAI planning assistant that helps people in India organize weddings, birthdays and community events with budgets, timelines, vendor checklists and personalized ideas.

## Language

**Assistant**:
The GenAI planner the user converses with. It is the product: it gathers the brief, does the planning work and keeps it up to date.
_Avoid_: app, bot, chatbot, copilot

**Event**:
An occasion being planned: a wedding, a birthday or a community event. Made of one or more Functions.
_Avoid_: occasion, party, project

**Function**:
One gathering within an Event, with its own date, place, guest count and share of the budget. A wedding has several (haldi, mehendi, sangeet, wedding, reception); a birthday usually has one. A programme that repeats, such as a society's evening aarti on each day of a Ganesh utsav, is one Function with a date range.
_Avoid_: sub-event, ceremony, session

**Brief**:
What the Members tell the Assistant about an Event before its first plan: the Event type, city, date, Guest count and budget, plus anything else they mention. Whatever the Brief leaves out, the Assistant fills in as Assumptions.
_Avoid_: intake, questionnaire, requirements, form

**Assumption**:
A value other than a price that the Assistant filled in because the Brief didn't give it, such as a Function's Guest count, a date when only the month was given, or a run sheet time. It is shown as assumed until a Member confirms or changes it.
_Avoid_: default, guess, placeholder

**Tradition**:
The community or regional customs that decide which Functions a wedding has, such as North Indian Hindu, Marwari, Punjabi or Sikh, Muslim, South Indian Hindu, Bengali or Christian. A wedding of two families can mix two.
_Avoid_: religion, caste, culture, community

**Theme**:
The look and feel chosen for an Event: a colour palette and a few style words (e.g. "royal Rajputana, marigold, pastel"). Members can edit it. It shapes the Suggestions and the decor in the plan.
_Avoid_: vibe, mood, aesthetic, style

**Vibe pick**:
The optional step before the first plan where a Member taps a few images to seed the Theme. The tapped images are saved as Inspirations.
_Avoid_: moodboard, image quiz, style quiz

**Event key**:
An AI provider key a Member attaches to one Event. While it is attached, the Assistant's replies and image generation in that Event run on it instead of the default model.
_Avoid_: BYOK, API key, own key

## People

**Member**:
A person planning an Event, with access to its Canvas and Chat.
_Avoid_: collaborator, user, planner, guest

**Guest**:
A person attending an Event or one of its Functions. Guests are counted and invited; they don't plan.
_Avoid_: attendee, invitee, visitor, member

## Vendors

**Vendor**:
A business that provides something for an Event, such as a venue, caterer, decorator or photographer. Every Vendor has one category. A Vendor found on its own website is one shared record for every Event; one a Member typed in by hand belongs to that Event only.
_Avoid_: listing, supplier, service provider

**Venue**:
A Vendor whose category is a place to hold a Function, such as a banquet hall or marriage garden. It may also carry a capacity and a price per plate.
_Avoid_: hall, location, property

**Shortlisted Vendor**:
A Vendor that Members have added to their Event's Canvas, linked to one or more Vendor checklist Entries. Each link has its own status: Considering, Contacted, Quoted, Booked or Dropped.
_Avoid_: saved vendor, favourite, selected vendor

**Discovery**:
The Assistant finding Vendors, at a Member's request, by searching the web and reading the Vendors' own websites.
_Avoid_: scraping, crawling, vendor search

## Workspace

**Canvas**:
The shared workspace of one Event, where the Assistant does its work and everything the people planning have added is laid out.
_Avoid_: board, dashboard, page

**Chat**:
The conversation of one Event, between the people planning it and the Assistant. Additions made in the Chat land on the Canvas.
_Avoid_: thread, room, group

**Item**:
One thing laid out on a Canvas: the Budget, the Timeline, the Vendor checklist, a Shortlisted Vendor, an Inspiration, a Suggestion or a Note.
_Avoid_: card, block, widget, element

**Section**:
A named part of a Canvas that holds Items. Every Event starts with four (Money and dates, Vendors, Inspirations, Notes), and Members can add their own. Each Item sits in one Section.
_Avoid_: group, frame, area, cluster

**Entry**:
One row inside the Budget, the Timeline or the Vendor checklist, such as one budget line, one deadline or one checklist task.
_Avoid_: line, row, task (as a general term)

**Note**:
An Item holding free text that a person wrote on the Canvas or saved from the Chat.
_Avoid_: sticky, memo, comment

**Comment**:
A remark a person attaches to an Item, an Entry or a highlighted passage of an Item's text.
_Avoid_: reply, note, annotation

**Inspiration**:
An image or reference saved to a Canvas to shape the look and feel of an Event, whether from a stock photo, an AI generation or Pinterest.
_Avoid_: pin, idea, moodboard item

**Suggestion**:
A personalised idea from the Assistant for an Event or one of its Functions, such as "Rajasthani folk musicians at the sangeet dinner", possibly with an Estimate. It is not part of the plan until a Member adds it, which turns it into a budget Entry and a Timeline Entry; a Member can also dismiss it.
_Avoid_: idea, recommendation, tip, touch

**Proposal**:
A change to the Canvas that the Assistant has prepared but not made, shown in the Chat (or the Comment thread it was asked from) for a Member to accept or reject. Risky changes (deletions, the Budget total, large shifts) and changes no Member asked for arrive as Proposals.
_Avoid_: suggestion, draft, pending change, approval

**Nudge**:
A short message the Assistant posts in the Chat without being asked, because something on the Canvas needs attention, such as the Budget going over its total. A Nudge never changes the Canvas.
_Avoid_: alert, notification, reminder

**Run sheet**:
The Timeline's Entries for the day of one Function, each with a time, such as "7:30 pm varmala".
_Avoid_: itinerary, schedule, agenda, programme

**Marker**:
A point on the map that stands for a Vendor's location. It is approximate when the address only matched a locality or city, until a Member drags it into place.
_Avoid_: pin, dot, location

## Prices

**Listed price**:
A price taken from a Vendor's own website, always shown with that page, the sentence it came from and the date it was seen. It is comparable when its unit is per plate, per person, per day or per function and its amount is clear; otherwise it is shown as text only.
_Avoid_: rate, market price

**Estimate**:
A price the Assistant generated, always labeled as such.
_Avoid_: guess, approximate price

**Quote**:
A price a Vendor actually gave the Members, entered by them for one of a Shortlisted Vendor's checklist Entries.
_Avoid_: bid, offer, final price

## Budget

**Event-wide**:
The part of an Event's Budget not tied to one Function, such as outfits, invitations or one photographer covering every Function. The Event total is the Function totals plus Event-wide plus the Contingency.
_Avoid_: shared, common, general, overall

**Contingency**:
A budget Entry held back for surprises, 10% of the rest of the Budget unless Members change it.
_Avoid_: buffer, reserve, padding

**Unallocated**:
The part of an Event's budget left over when every budget Entry is already at the high end of its Estimate. Members can move it into any Entry.
_Avoid_: surplus, extra, savings

**Budget check**:
The comparison of an Event's budget with the typical range of Estimates for its city, Functions and Guest counts. A budget below the typical minimum is flagged on the Brief before the first plan, with ways to close the gap.
_Avoid_: feasibility check, reality check, validation

**City tier**:
The government's X, Y or Z class of a city (for example Delhi is X, Jaipur is Y, and unlisted towns are Z), used to scale Estimates to where the Event happens.
_Avoid_: city class, metro, tier-1
