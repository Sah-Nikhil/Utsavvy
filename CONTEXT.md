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
One gathering within an Event, with its own date, place, guest count and share of the budget. A wedding has several (haldi, mehendi, sangeet, wedding, reception); a birthday usually has one.
_Avoid_: sub-event, ceremony, session

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
A business that provides something for an Event, such as a venue, caterer, decorator or photographer. Every Vendor has one category.
_Avoid_: listing, supplier, service provider

**Venue**:
A Vendor whose category is a place to hold a Function, such as a banquet hall or marriage garden. It may also carry a capacity and a price per plate.
_Avoid_: hall, location, property

## Workspace

**Canvas**:
The shared workspace of one Event, where the Assistant does its work and everything the people planning have added is laid out.
_Avoid_: board, dashboard, page

**Chat**:
The conversation of one Event, between the people planning it and the Assistant. Additions made in the Chat land on the Canvas.
_Avoid_: thread, room, group

**Item**:
One thing laid out on a Canvas: the Budget, the Timeline, the Vendor checklist, a Vendor, an Inspiration or a Note.
_Avoid_: card, block, widget, element

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

**Marker**:
A point on the map that stands for a vendor's location.
_Avoid_: pin, dot, location

## Prices

**Listed price**:
A price taken from a public source, always shown with that source and the date it was seen.
_Avoid_: rate, market price

**Estimate**:
A price the Assistant generated, always labeled as such.
_Avoid_: guess, approximate price

**Quote**:
A price a vendor actually gave the people planning, entered by them.
_Avoid_: bid, offer, final price
