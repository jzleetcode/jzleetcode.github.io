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

### Check VB.Net Code

Visual basic ASP.NET uses the Model View Controller (MVC) architecture. To find the corresponding VB code for an aspx web page, you can right-click anywhere in the aspx file and select view code.

### Text Editor Configuration

Menu -> Tools -> Options, search for Visual Basic.

Text Editor -> "All Languages" or "Visual Basic" -> Tabs.

Set tab size and indent size as desired. Choose "insert spaces" or "keep tabs" as desired.

### Configure Windows Registry

VB.Net application may use Windows Registry configuration. For example, the key might be `Computer\HKEY_LOCAL_MACHINE\SOFTWARE\<company>\<Application1>`.

You could open the Windows registry editor by searching for that in the Windows search bar or run (win key + R), then type `regedit`. Each folder in the left side explorer is a key and a sub folder is a sub key. Right click on a folder, you could export that key as a file , create a sub key under that key, or create a value (string, binary, DWORD, .etc). Each value has a "value name" and "value data" (a key value pair). The registry editor shows three columns for each value: name, type, and data.

Check registry values are configured correctly.

```
Value Name: <DB1>Sql3Connect
Value Data (String):
    Data Source=<name>-aws.<domain>.net;Initial Catalog=<DB1>_Dev;Integrated Security=SSPI;MultiSubnetFailover=True;
```

### Configure Microsoft Edge to use Internet Explorer Mode

If your project requires Microsoft Internet Explorer, then you will have to use IE. If you are on Windows 11, you would have to use Microsoft Edge with IE compatible mode.

1. Visit `edge://compat/enterprise` and ensure the enterprise site list is up to date. This is the site list for Internet Explorer mode defined by your organization. You could click the "Force update" button to update the list. Location could be `file://us.<org>.com/path/.../IESites.xml`.
2. Go to edge settings (three dots button) -> Default Browser -> Select "Allow" for the dropdown for "Allow sites to be reloaded in Internet Explorer Mode (IE Mode)".
3. Go to cookies and site permissions and allow Javascript, Images, and "Pop-ups and redirects".
4. Visit a URL, click the three-dots button -> "Reload in Internet Explorer Mode". You should see the IE icon next to the URL search bar. You can reload to turn IE mode off as well.

### Install Windows Services

For Microsoft Visual Basic dot net (VB.Net) projects. You may have to install the executable files (exe) as Windows services to test.

In Windows search bar, search for "Developer Command Prompt for VS 2022". Right-click and start the CMD as admin.

```shell
**********************************************************************
** Visual Studio 2022 Developer Command Prompt v17.12.4
** Copyright (c) 2022 Microsoft Corporation
**********************************************************************

C:\Windows\System32>installutil.exe C:\Users\<user>\<path>\Source\...\bin\Service1.exe
Microsoft (R) .NET Framework Installation utility Version 4.8.9032.0
Copyright (C) Microsoft Corporation.  All rights reserved.

Running a transacted installation.

Beginning the Install phase of the installation.
See the contents of the log file for the C:\Users\<user>\<path>\Source\...\bin\Service1.exe assembly's progress.
The file is located at C:\Users\<user>\<path>\Source\...\bin\Service1.exe.InstallLog.
Installing assembly 'C:\Users\<user>\<path>\Source\...\bin\Service1.exe'.
Affected parameters are:
   logtoconsole =
   logfile = C:\Users\<user>\<path>\Source\...\bin\Service1.InstallLog
   assemblypath = C:\Users\<user>\<path>\Source\...\bin\Service1.exe
Installing service Service1...
Creating EventLog source Service1 in log Application...

An exception occurred during the Install phase.
System.ComponentModel.Win32Exception: The account name is invalid or does not exist, or the password is invalid for the account name specified

The Rollback phase of the installation is beginning.
...
Restoring event log to previous state for source Service1.

The Rollback phase completed successfully.

The transacted install has completed.
The installation failed, and the rollback has been performed.
```

You may see transient error like

```shell
An exception occurred during the Install phase.
System.ComponentModel.Win32Exception: The trust relationship between this workstation and the primary domain failed
```

Try to log in with `user@domain.net` and password.

```shell
C:\Windows\System32>installutil.exe C:\Users\<user>\<path>\Source\...\bin\Service2.exe
Microsoft (R) .NET Framework Installation utility Version 4.8.9032.0
Copyright (C) Microsoft Corporation.  All rights reserved.

Running a transacted installation.

Beginning the Install phase of the installation.
See the contents of the log file for the C:\Users\<user>\<path>\Source\...\bin\Service1.exe assembly's progress.
The file is located at C:\Users\<user>\<path>\Source\...\bin\Service2.InstallLog.
Installing assembly 'C:\Users\<user>\<path>\Source\...\bin\Service2.exe'.
Affected parameters are:
logtoconsole =
logfile = C:\Users\<user>\<path>\Source\...\bin\Service2.InstallLog
assemblypath = C:\Users\<user>\<path>\Source\...\bin\Service2.exe
Installing service RmDTGRateEngineConsumer1...
Service RmDTGRateEngineConsumer1 has been successfully installed.
Creating EventLog source RmDTGRateEngineConsumer1 in log Application...

The Install phase completed successfully, and the Commit phase is beginning.
See the contents of the log file for the C:\Users\<user>\<path>\Source\...\bin\Service2.exe assembly's progress.
The file is located at C:\Users\<user>\<path>\Source\...\bin\Service2.InstallLog.
Committing assembly 'C:\Users\<user>\<path>\Source\...\bin\Service2.exe'.
Affected parameters are:
logtoconsole =
logfile = C:\Users\<user>\<path>\Source\...\bin\Service2.InstallLog
assemblypath = C:\Users\<user>\<path>\Source\...\bin\Service2.exe

The Commit phase completed successfully.

The transacted install has completed.
```

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

### Stored Procedures

In the "Object Explorer", expand "Programmability" -> "Stored Procedures". Right click on a stored procedure (e.g., dbo.sp<Table1>_Insert) then "view dependencies", you can check "Obects on which [sp<Table1>_Insert] depends".

To view the script for the stored procedure, you could right-click -> "Script Stored Procedure as" -> "CREATE To" -> "New Query Editor Window". Or run sql script `exec sp_helptext '<procedure_name>''` (much faster).

```sql
select * from dbo.TableDefinition where TableName ='<table_name>'
```

To check all stored procedures.

```sql
select distinct ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_DEFINITION LIKE '%<SEARCH_STRING>%' AND ROUTINE_TYPE = 'PROCEDURE'
```

### Triggers

In the "Object Explorer",

1. expand "Programmability" -> "Database Triggers"
2. expand "Server Objects" -> "Triggers"

### References

1. VB.Net Sub Statement [doc](https://learn.microsoft.com/en-us/dotnet/visual-basic/language-reference/statements/sub-statement)
