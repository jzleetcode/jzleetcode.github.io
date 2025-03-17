---
author: JZ
pubDatetime: 2024-11-01T08:22:00Z
modDatetime: 2024-11-01T10:12:00Z
title: CheatSheet for Windows Development
tags:
  - cheatsheet-windows
description:
  "tips for software development in Windows Operating System"
---

## Table of contents

## Tools

1. Microsoft Visual Studio https://visualstudio.microsoft.com/
2. Microsoft SQL Server Management Studio

## Microsoft Visual Studio

https://visualstudio.microsoft.com/vs/pricing/?tab=paid-subscriptions The pricing is a bit confusing. There are monthly and standard options. The prices were $45 and $99.99 per month per user for the two options. The standard option seem to offer more features for cloud development.

This article used Microsoft Visual Studio Community Edition 2022.

To open a project, you could open the root folder to view the project as files. Alternatively or typically, you could open the solution file. For example, `C:\Users\<user_name>\path...\<project_root>\Source\path...\solution1.sln`.

In "Solution Explorer" section on the right, find the icon (with purple MSVS icon in the bottom left corner) with tool tip (switch between solutions and available views). Click that icon and get the view "Solution Explorer". The other view is "Solution Explorer - Views" with folder view and views for other solutions.

Find `C:\Users\<user_name>\path...\Source\path..\Application1`. Right click and "set as start up project".

Find `C:\Users\<user_name>\path...\Source\path..\Application1\Page1.aspx`. Right click and "set as start page".

On the standard toolbar right below the menu bar, in the drop-down selectors select "Debug", "Mixed Platforms", "<Application_name>", click "IIS Express (Microsoft Edge)" button with the green run button. (There is another green button on the right says "start without debugging".) This should start a page in Microsoft edge loading http://localhost:1721/Promotion.aspx. The right Solution Explorer window should now show "Diagnostic Tools" displaying Events, process memory, and cpu %. The page should load after a couple of minutes. Alternatively, you could try chrome if it is supported.

### Configure Microsoft Edge to use Internet Explorer Mode

If your project requires Microsoft Internet Explorer, then you will have to use IE. If you are on Windows 11, you would have to use Microsoft Edge with IE compatible mode.



## Microsoft SQL Server Database

Use Microsoft SQL Server Management Studio in a Windows machine (virtual or actual Windows). This article is based on version 20.2.

1. File -> Connect Object Explorer
2. In the popup, put in server name (sql server name)
3. Authentication dropdown, use "Windows Authentication"
4. User name and password section is grayed out. User name is <Domain>\<user_name>
5. Change Encryption dropdown to optional

See active directory [overview doc](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/get-started/virtual-dc/active-directory-domain-services-overview), [domain account doc](https://learn.microsoft.com/en-us/windows/win32/ad/domain-user-accounts)

How to check the Databases and Tables in the Microsoft SQL Server?

You can expand the database project structure (tree view) in the top left Object Explorer view. Or you could use SQL script below.

```sql
select * from information_schema.tables
-- table below shows columns: table_catalog (default should be master db), table_schema (dbo), table_name, and table_type (base_table, view)
select * from master.information_schema.tables
-- by default should be the same result as above
select * from <db>.information_schema.tables
-- tables in db
select name, database_id, create_date from sys.databases; go
-- list databses in this server: master, msdb, model, tempdb, .etc
```

In the SQL Editor toolbar, you could open a previously saved SQL query script file or a new file and select the database server to connect for that. After the connection is successfully made, you could then select the database of interest in the dropdown selector. Typically, the databases in this server are listed which includes the system databases such as master, model, msdb, and tempdb, as well as the database for your own application.

Alternatively, you could connect using the SQL server Authentication mechanism with login and password.

Use menu bar: File, New, Database Engine Query to start a new SQL script text file where you can run SQL queries. You could select the query and click the Execute button on the "SQL Editor" toolbar to run the query (or F5 hotkey). So it would be easier if you can keep the query on one line then you can select it by double click that line.


## MongoDB

For MongoDB 8.0.1 installed with HomeBrew.

### `mongosh` commands

```shell
brew services start mongodb-community@8.0
brew services stop mongodb-community@8.0

mongosh
show dbs # to show databases
show collections # to show collections
use <db_name>
db.<collection_name>.find() # scan the collection
db.<collection_name>.countDocuments() # total count in collection

# scan with a filter
db.<collection_name>.find({'field':'value'})
db.<collection_name>.findOne({'_id':'value'})

# delete with a filter
db.<collection_name>.deleteMany({'field':'value'})
{ acknowledged: true, deletedCount: 2 }
```

### Pymongo

How to set log levels for `pymongo` python mongodb client?

By default, the client log level is `DEBUG`. You can change the log level as below. This line changes for the whole client.

```python
logging.getLogger('pymongo').setLevel(logging.ERROR)
```

For more control at the module level,
see pymongo doc [logging](https://pymongo.readthedocs.io/en/latest/examples/logging.html).

### References

1. multiple databases vs multiple collections: https://www.mongodb.com/community/forums/t/multiple-databases-vs-multiple-collections/211758
2. update across multiple collections in the same database https://www.mongodb.com/community/forums/t/update-data-across-multiple-collections-within-the-same-database/118979
3. how to choose a shard key [doc](https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/)
