import { readFileSync, writeFileSync } from "fs";
import ObjectPath from "object-path";

const { get: getWithPath, set: setWithPath } = ObjectPath;

export function splitEvery(string: string, n: number): string[] {
	const chunks = [];

	for (var i = 0, stringLength = string.length; i < stringLength; i += n)
		chunks.push(string.substring(i, i + n));

	return chunks;
}

export interface Database {
	[x: string]: string;
}

export interface TagOptions {
	name: string;
	userTag: string;
	userId: string;
	content: string;
    fromDBHDocs?: boolean;
}

export interface Tag extends TagOptions {
	date: string;
	pages: string[];
}

export interface Tags {
	[x: string]: Tag;
}

export interface PageData {
	messageID: string;
	channelID: string;
	userID: string;
	page: number;
	pages: number;
	tag: string;
}

export function get<T = void>(
	path?: string,
): T extends void ? (typeof path extends string ? string : Database) : T {
	const db = JSON.parse(readFileSync("./data/db.json", { encoding: "utf8" }));

	return path ? getWithPath(db, path) : db;
}

export function set(path: string, value: any): Database {
	const db = JSON.parse(readFileSync("./data/db.json", { encoding: "utf8" }));

	setWithPath(db, path, value);
	writeFileSync("./data/db.json", JSON.stringify(db, null, 4));

	return db;
}

if (!get("tags")) set("tags", {});
set("pages", {});

export function addTag(options: TagOptions): Database {
	return set(
		`tags.${options.name}`,
		Object.assign(options, {
			date: new Date().getTime().toString(),
			pages: splitEvery(options.content, 678),
		}),
	);
}

export function getTag(name: string): Tag {
	return get<Tag>(`tags.${name}`);
}

export function getTags(): Tags {
	return get<Tags>("tags");
}

export function deleteTag(name: string): void {
	set(`tags.${name}`, undefined);
}

export function getPage(id: string): PageData & { botMessage: string } {
	return get<PageData & { botMessage: string }>(`pages.${id}`);
}

export function setPage(data: PageData): Database {
	return set(`pages.${data.messageID}`, data);
}

export function modifyPage(
	id: string,
	data: Partial<PageData & { botMessage?: string }>,
): Database {
	return set(
		`pages.${id}`,
		Object.assign(get<PageData>(`pages.${id}`), data),
	);
}

export function deletePage(messageID: string): void {
	set(`tags.${messageID}`, undefined);
}
